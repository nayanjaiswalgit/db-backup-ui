"""
Data masking service for cross-environment restores
"""
import hashlib
import random
import string
from typing import Any, Dict, Optional


class DataMaskingService:
    """Service for masking sensitive data during cross-environment restores"""

    @staticmethod
    def mask_email(email: str) -> str:
        """Mask email address"""
        if '@' not in email:
            return email

        local, domain = email.split('@')
        masked_local = hashlib.md5(local.encode()).hexdigest()[:8]
        return f"{masked_local}@example.com"

    @staticmethod
    def mask_phone(phone: str) -> str:
        """Mask phone number"""
        # Keep format but randomize digits
        masked = ''.join(
            random.choice(string.digits) if c.isdigit() else c
            for c in phone
        )
        return masked

    @staticmethod
    def mask_ssn(ssn: str) -> str:
        """Mask SSN"""
        # Return format XXX-XX-XXXX with randomized digits
        digits = ''.join(random.choice(string.digits) for _ in range(9))
        return f"{digits[:3]}-{digits[3:5]}-{digits[5:]}"

    @staticmethod
    def mask_credit_card(cc: str) -> str:
        """Mask credit card number"""
        # Keep first 6 and last 4, mask middle
        if len(cc) < 10:
            return '****'

        return cc[:6] + '*' * (len(cc) - 10) + cc[-4:]

    @staticmethod
    def mask_name(name: str) -> str:
        """Mask name"""
        # Use hash of name to generate consistent fake name
        hash_val = int(hashlib.md5(name.encode()).hexdigest(), 16)
        random.seed(hash_val)

        first_names = ['John', 'Jane', 'Alex', 'Sam', 'Chris', 'Pat', 'Jordan']
        last_names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia']

        return f"{random.choice(first_names)} {random.choice(last_names)}"

    @staticmethod
    def mask_address(address: str) -> str:
        """Mask address"""
        # Generate fake address
        street_nums = random.randint(100, 9999)
        streets = ['Main St', 'Oak Ave', 'Park Rd', 'Elm Dr', 'Pine Ln']
        return f"{street_nums} {random.choice(streets)}"

    @staticmethod
    def hash_value(value: str) -> str:
        """Hash value using SHA-256"""
        return hashlib.sha256(value.encode()).hexdigest()

    @staticmethod
    def randomize_string(length: int) -> str:
        """Generate random string"""
        return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

    @staticmethod
    def null_value() -> None:
        """Return null value"""
        return None

    @staticmethod
    def apply_masking_rules(
        data: Dict[str, Any],
        rules: Dict[str, str]
    ) -> Dict[str, Any]:
        """
        Apply masking rules to data

        Args:
            data: Data to mask
            rules: Masking rules (field_name: mask_type)
                   Supported mask types: email, phone, ssn, credit_card, name,
                   address, hash, randomize, null

        Returns:
            Masked data
        """
        masked_data = data.copy()

        for field, mask_type in rules.items():
            if field not in masked_data:
                continue

            value = str(masked_data[field])

            if mask_type == 'email':
                masked_data[field] = DataMaskingService.mask_email(value)
            elif mask_type == 'phone':
                masked_data[field] = DataMaskingService.mask_phone(value)
            elif mask_type == 'ssn':
                masked_data[field] = DataMaskingService.mask_ssn(value)
            elif mask_type == 'credit_card':
                masked_data[field] = DataMaskingService.mask_credit_card(value)
            elif mask_type == 'name':
                masked_data[field] = DataMaskingService.mask_name(value)
            elif mask_type == 'address':
                masked_data[field] = DataMaskingService.mask_address(value)
            elif mask_type == 'hash':
                masked_data[field] = DataMaskingService.hash_value(value)
            elif mask_type == 'randomize':
                masked_data[field] = DataMaskingService.randomize_string(len(value))
            elif mask_type == 'null':
                masked_data[field] = None

        return masked_data

    @staticmethod
    def generate_sql_masking_queries(
        table: str,
        rules: Dict[str, str],
        database_type: str = 'postgresql'
    ) -> list:
        """
        Generate SQL queries for masking data in place

        Args:
            table: Table name
            rules: Masking rules
            database_type: Database type (postgresql, mysql)

        Returns:
            List of SQL UPDATE queries
        """
        queries = []

        for field, mask_type in rules.items():
            if mask_type == 'email':
                if database_type == 'postgresql':
                    query = f"UPDATE {table} SET {field} = MD5({field}::text) || '@example.com'"
                else:
                    query = f"UPDATE {table} SET {field} = CONCAT(MD5({field}), '@example.com')"

            elif mask_type == 'null':
                query = f"UPDATE {table} SET {field} = NULL"

            elif mask_type == 'hash':
                if database_type == 'postgresql':
                    query = f"UPDATE {table} SET {field} = MD5({field}::text)"
                else:
                    query = f"UPDATE {table} SET {field} = MD5({field})"

            elif mask_type == 'randomize':
                # This would need a custom function in the database
                continue

            else:
                # Skip complex masking that requires application logic
                continue

            queries.append(query)

        return queries
