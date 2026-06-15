import secrets


def generate_avatar_seed() -> str:
    return secrets.token_urlsafe(24)
