import json
import os
import hashlib
from datetime import datetime
from typing import Dict, Any
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from app.domain.models import AuditLogEntry

class CryptoAuditAdapter:
    def __init__(self, log_path: str = "audit_log.jsonl", private_key_path: str = "private_key.pem"):
        self.log_path = log_path
        self.private_key_path = private_key_path
        self._load_or_generate_keys()
        
    def _load_or_generate_keys(self):
        if os.path.exists(self.private_key_path):
            with open(self.private_key_path, "rb") as key_file:
                self.private_key = serialization.load_pem_private_key(
                    key_file.read(),
                    password=None
                )
        else:
            self.private_key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=2048,
            )
            # Save it (in secure real app, this needs HSM/Vault)
            with open(self.private_key_path, "wb") as f:
                f.write(self.private_key.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption()
                ))

    def _get_last_hash(self) -> str:
        if not os.path.exists(self.log_path):
            return "0" * 64
        
        last_line = ""
        with open(self.log_path, "r") as f:
            for line in f:
                if line.strip():
                    last_line = line
        
        if not last_line:
            return "0" * 64
            
        try:
            entry = json.loads(last_line)
            # Reconstruct signature input to verify or just use the sig as link?
            # Stronger chain uses hash of full previous object
            return hashlib.sha256(last_line.encode()).hexdigest()
        except:
            return "0" * 64

    def log_action(self, user_id: str, action: str, details: Dict[str, Any]):
        prev_hash = self._get_last_hash()
        timestamp = datetime.utcnow().isoformat()
        
        # Prepare data to sign
        # Canonicalize JSON for consistent hashing
        data_to_sign_dict = {
            "timestamp": timestamp,
            "user_id": user_id,
            "action": action,
            "details": details,
            "previous_hash": prev_hash
        }
        data_bytes = json.dumps(data_to_sign_dict, sort_keys=True).encode()
        
        # Sign content
        signature = self.private_key.sign(
            data_bytes,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        
        entry = AuditLogEntry(
            timestamp=datetime.fromisoformat(timestamp),
            user_id=user_id,
            action=action,
            details=details,
            previous_hash=prev_hash,
            signature=signature.hex()
        )
        
        with open(self.log_path, "a") as f:
            f.write(entry.json() + "\n")
