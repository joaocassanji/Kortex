from typing import List, Any
from app.ports.interfaces import LLMProviderPort
from app.domain.models import AnalysisResult, KubernetesResource, RemediationStep, Issue, Severity, IssueCategory
from langchain_community.chat_models import ChatOllama
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
import json

class LangChainAdapter(LLMProviderPort):
    def __init__(self, provider: str = "ollama", model_name: str = "llama3"):
        self.provider = provider
        if provider == "openai":
            self.llm = ChatOpenAI(model_name=model_name or "gpt-4-turbo")
        else:
            self.llm = ChatOllama(model=model_name or "llama3", format="json")
            
        self.parser = PydanticOutputParser(pydantic_object=AnalysisResult)

    async def analyze_context(self, context: List[KubernetesResource], query: str) -> AnalysisResult:
        # Create a condensed context string to save tokens and focus attention
        context_summary = []
        for r in context:
            # Include essential fields, exclude extensive status/managedFields
            summary = {
                "kind": r.kind,
                "name": r.name,
                "namespace": r.namespace,
                "uid": r.unique_id,
                "spec": r.content.get("spec", {}),
                "metadata": {k: v for k, v in r.content.get("metadata", {}).items() if k in ["labels", "annotations"]}
            }
            context_summary.append(summary)
            
        context_str = json.dumps(context_summary, indent=2)
        
        example_output = {
            "summary": "The namespace contains several critical security issues, including privileged containers and missing resource limits.",
            "issues": [
                {
                    "severity": "HIGH",
                    "category": "SECURITY",
                    "title": "Privileged Container Detected",
                    "description": "The pod 'nginx-app' is running as privileged.",
                    "affected_resource_ids": ["uid-123"],
                    "remediation_suggestion": {
                        "description": "Remove securityContext.privileged flag.",
                        "action_type": "PATCH",
                        "manifest": {},
                        "target_resource_id": "uid-123"
                    }
                }
            ]
        }
        example_str = json.dumps(example_output, indent=2)

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a Senior Kubernetes Site Reliability Engineer available to analyze cluster resources."),
            ("user", "CONTEXT RESOURCES (JSON):\n{context}\n\n"
                     "INSTRUCTION: {query}\n\n"
                     "CRITICAL OUTPUT RULES:\n"
                     "1. Respond ONLY with valid JSON. Do not include markdown keys or explanations outside the JSON.\n"
                     "2. You MUST return an object with 'summary' (string) and 'issues' (list of objects).\n"
                     "3. For each issue, you MUST valid 'affected_resource_ids' from the Context.\n"
                     "4. Use the following exact JSON schema:\n{example_str}\n\n"
                     "START ANALYSIS AND GENERATE JSON:")
        ])
        
        # Remove parser from chain to avoid validation errors on raw output
        chain = prompt | self.llm
        
        try:
            response = await chain.ainvoke({
                "context": context_str, 
                "query": query,
                "example_str": example_str
            })
            
            # Manual Parsing Logic (Same as analyze_resource)
            content = response.content if hasattr(response, 'content') else str(response)
            content = content.replace("```json", "").replace("```", "").strip()
            
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                print(f"Failed to parse JSON content: {content[:200]}...")
                return AnalysisResult(summary="Analysis failed: Invalid JSON output from AI.", issues=[])

            # Smart Unwrapping
            if "summary" not in data and "issues" not in data:
                for key in ["analysis_result", "AnalysisResult", "result", "output", "json"]:
                    if key in data and isinstance(data[key], dict):
                        data = data[key]
                        break
            
            # Extract Summary
            summary_raw = data.get("summary", "Analysis completed.")
            if isinstance(summary_raw, (list, dict)):
                summary = json.dumps(summary_raw)
            else:
                summary = str(summary_raw)

            # Extract Issues
            issues_data = data.get("issues", [])
            issues = []
            for i in issues_data:
                try:
                    # Severity Normalization
                    if "severity" in i:
                        i["severity"] = i["severity"].upper()
                        if i["severity"] not in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]:
                            i["severity"] = "LOW"
                    if "category" in i:
                         i["category"] = i["category"].upper()
                    
                    issues.append(Issue(**i))
                except Exception as e:
                    print(f"Skipping invalid issue: {e}")
                    continue
            
            return AnalysisResult(summary=summary, issues=issues)

        except Exception as e:
            print(f"LLM Error in analyze_context: {e}")
            return AnalysisResult(summary=f"Analysis failed due to error: {str(e)}", issues=[])

    async def analyze_resource(self, target: KubernetesResource, context: List[KubernetesResource]) -> AnalysisResult:
        # Context strategy: Filter to relevant namespace + cluster scoped to reduce noise?
        # For now, let's include everything but maybe summarized to save tokens
        
        # Summary for context to reduce tokens
        context_summary = [{"kind": r.kind, "name": r.name, "namespace": r.namespace, "uid": r.unique_id} for r in context]
        context_str = json.dumps(context_summary, indent=2)
        target_str = json.dumps(target.dict(exclude={'content': {'managedFields'}}), indent=2)
        
        example_output = {
            "summary": "The resource is generally healthy but lacks resource limits, which could lead to node instability.",
            "issues": [
                {
                    "severity": "MEDIUM",
                    "category": "PERFORMANCE",
                    "title": "Missing Resource Limits",
                    "description": "The container 'app' has no resource limits defined.",
                    "remediation_suggestion": {
                        "description": "Add resources.limits to the container spec.",
                        "action_type": "PATCH",
                        "manifest": {},
                        "target_resource_id": "target-id"
                    }
                }
            ]
        }
        example_str = json.dumps(example_output, indent=2)

        prompt = ChatPromptTemplate.from_messages([
            ("user", "You are a Kubernetes Expert. Your goal is to analyze the target resource configuration and return a JSON response.\n\n"
                     "CONTEXT SUMMARY:\n{context}\n\n"
                     "TARGET RESOURCE:\n{target}\n\n"
                     "CRITICAL INSTRUCTIONS:\n"
                     "1. Return ONLY valid JSON. No markdown, no explanations outside JSON.\n"
                     "2. You must include a 'summary' field (string) explaining if the resource is healthy or has issues. If healthy, explain WHY (e.g. 'Readiness probe is configured').\n"
                     "3. You must include an 'issues' field (list). If no issues, return [].\n"
                     "4. CONSISTENCY CHECK: If you mention an improvement in the summary (e.g. 'could benefit from resource limits'), you MUST create an issue for it in the 'issues' list.\n"
                     "5. Follow this EXACT schema:\n"
                     "{example_str}\n\n"
                     "GENERATE JSON NOW:")
        ])
        
        # Determine strictness via direct string parsing to be more robust
        chain = prompt | self.llm
        
        try:
            response = await chain.ainvoke({
                "context": context_str, 
                "target": target_str, 
                "example_str": example_str
            })
            
            # Extract text
            content = response.content if hasattr(response, 'content') else str(response)
            print(f"RAW LLM RESPONSE: {content}")
            
            # Cleaning: remove markdown code blocks if present
            content = content.replace("```json", "").replace("```", "").strip()
            
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                # Fallback: maybe it didn't complete? Or has extra text?
                print(f"Failed to parse JSON content: {content}")
                return AnalysisResult(summary="Analysis failed: Invalid JSON output from AI.", issues=[])

            # Smart Unwrapping of known wrapper keys models love to use
            if "summary" not in data and "issues" not in data:
                # Try to find a nested object
                for key in ["analysis_result", "AnalysisResult", "result", "output", "json"]:
                    if key in data and isinstance(data[key], dict):
                        data = data[key]
                        break
            
            # Final Safety Check
            # If summary is missing (it shouldn't be), provide a default analysis confirmation.
            summary_raw = data.get("summary", "Analyzed. No specific summary returned by AI model.")
            if isinstance(summary_raw, list):
                # If list of strings, join them
                if all(isinstance(x, str) for x in summary_raw):
                    summary = "\n".join(summary_raw)
                else:
                    # If list of objects, json dump or stringify
                    summary = json.dumps(summary_raw, indent=2)
            elif isinstance(summary_raw, dict):
                summary = json.dumps(summary_raw, indent=2)
            else:
                summary = str(summary_raw)

            issues_data = data.get("issues", [])
            
            # Normalize issues
            issues = []
            for i in issues_data:
                try:
                    # Fix common type mismatches in issues
                    if "severity" in i:
                        i["severity"] = i["severity"].upper()
                        # Fallback for unknown severities
                        if i["severity"] not in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]:
                            i["severity"] = "LOW"
                            
                    if "category" in i:
                        i["category"] = i["category"].upper()
                        
                    issues.append(Issue(**i))
                except Exception as e:
                    print(f"Skipping invalid issue: {i} - {e}")
                    continue # Skip malformed issues
            
            return AnalysisResult(summary=summary, issues=issues)
            
        except Exception as e:
            print(f"LLM Error during deep analysis: {e}")
            return AnalysisResult(summary=f"Analysis failed: {str(e)}", issues=[])

    async def generate_remediation(self, input_data: Any) -> RemediationStep:
        resource = input_data.get("resource")
        issue = input_data.get("issue")
        
        resource_str = json.dumps(resource, indent=2)
        
        # Define output schema for Parser
        parser = PydanticOutputParser(pydantic_object=RemediationStep)
        
        # Manually constructing schema prompt because parser.get_format_instructions() can be verbose or specific
        schema_json = '''
        {
            "description": "Explanation of the fix",
            "action_type": "APPLY",
            "manifest": { ... full valid kubernetes manifest ... },
            "target_resource_id": "original_resource_uid"
        }
        '''

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a Kubernetes Automation Engineer. You fix misconfigurations."),
            ("user", "Target Resource:\n{resource}\n\nIssue to Fix:\n{issue}\n\n"
                     "Task: Generate a corrected Kubernetes manifest that resolves the issue.\n"
                     "CRITICAL RULES:\n"
                     "1. The 'manifest' field MUST contain the COMPLETE valid Kubernetes resource definition (including apiVersion, Kind, metadata, spec).\n"
                     "2. Do NOT summarize or truncate the manifest. It must be apply-able via kubectl.\n"
                     "3. Maintain all other configurations (names, labels, images) exactly as is, only modify what is needed to fix the issue.\n"
                     "4. Return a JSON object matching this structure:\n{schema_json}")
        ])
        
        chain = prompt | self.llm
        
        try:
            response = await chain.ainvoke({
                "resource": resource_str,
                "issue": issue,
                "schema_json": schema_json
            })
            
            content = response.content if hasattr(response, 'content') else str(response)
            content = content.replace("```json", "").replace("```", "").strip()
            
            data = json.loads(content)
            
            # Ensure manifest is a dict
            if isinstance(data.get("manifest"), str):
                 try:
                     data["manifest"] = json.loads(data["manifest"])
                 except:
                     pass
                     
            # Validate manifest basic structure
            manifest = data.get("manifest", {})
            if not manifest.get("apiVersion") or not manifest.get("kind"):
                 print("Validation Warning: LLM generated partial manifest. Attempting to merge with original.")
                 # Merging logic could be complex. For now, try to patch the original resource with new spec?
                 # Or just failing is safer than applying bad yaml.
                 # Let's try to restore apiVersion/kind from original if missing
                 original_res = input_data.get("resource", {}).get("content", {})
                 if not manifest.get("apiVersion"): manifest["apiVersion"] = original_res.get("apiVersion")
                 if not manifest.get("kind"): manifest["kind"] = original_res.get("kind")
                 if not manifest.get("metadata"): manifest["metadata"] = original_res.get("metadata")
                 data["manifest"] = manifest

            return RemediationStep(**data)
            
        except Exception as e:
            print(f"Remediation Generation Failed: {e}")
            # Fallback for demo if LLM fails
            return RemediationStep(
                description="Automatic fix generation failed. Returning original resource.",
                action_type="APPLY",
                manifest=resource.get('content', {}),
                target_resource_id=resource.get('unique_id', 'unknown')
            )

    async def test_connection(self) -> bool:
        try:
            prompt = ChatPromptTemplate.from_messages([("user", "Hello, are you there?")])
            chain = prompt | self.llm
            await chain.ainvoke({})
            return True
        except Exception as e:
            print(f"Connection test failed: {e}")
            raise e
