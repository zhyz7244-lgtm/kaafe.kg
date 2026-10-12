CAFE = {
    "name": "KAAFI",
    "tagline": "Books · Coffee",
    "address": "ул. Анкара 46, Бишкек",
    "hours": "Ежедневно 9:00–22:00",
    "instagram_url": "https://www.instagram.com/kaafi_kg",
    "instagram_handle": "@kaafi_kg",
}


def cafe(request):
    from .models import BONUS_PERCENT

    return {"cafe": CAFE, "bonus_percent": BONUS_PERCENT}
