import os

from django import forms
from django.contrib.admin.views.decorators import staff_member_required
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST

from .models import Book, Product

PHOTO_KINDS = {"menu": Product, "books": Book}
MAX_PHOTO_BYTES = 5 * 1024 * 1024


@staff_member_required
def staff_photos(request):
    kind = "books" if request.GET.get("kind") == "books" else "menu"
    only_missing = request.GET.get("filter") == "no"
    if kind == "books":
        qs = Book.objects.order_by("sort_order", "-created_at", "id")
        items = [{"pk": b.pk, "title": b.title, "sub": b.author, "image": b.image} for b in qs]
    else:
        qs = Product.objects.select_related("category")
        items = [
            {"pk": p.pk, "title": f"{p.name} {p.volume}".strip(), "sub": p.category.name, "image": p.image}
            for p in qs
        ]
    total = len(items)
    missing = sum(1 for i in items if not i["image"])
    if only_missing:
        items = [i for i in items if not i["image"]]
    return render(
        request,
        "shop/staff_photos.html",
        {"kind": kind, "only_missing": only_missing, "items": items, "total": total, "missing": missing},
    )


def _target(kind, pk):
    model = PHOTO_KINDS.get(kind)
    if model is None:
        raise Http404
    return get_object_or_404(model, pk=pk)


@staff_member_required
@require_POST
def staff_photo_upload(request, kind, pk):
    obj = _target(kind, pk)
    f = request.FILES.get("photo")
    if f is None:
        return JsonResponse({"ok": False, "error": "Файл не выбран"}, status=400)
    try:
        forms.ImageField().clean(f)
        if f.size > MAX_PHOTO_BYTES:
            raise forms.ValidationError("Фото больше 5 МБ")
    except forms.ValidationError as e:
        return JsonResponse({"ok": False, "error": e.messages[0]}, status=400)
    if obj.image:
        obj.image.delete(save=False)
    obj.image.save(os.path.basename(f.name), f, save=True)
    return JsonResponse({"ok": True, "url": obj.image.url})


@staff_member_required
@require_POST
def staff_photo_delete(request, kind, pk):
    obj = _target(kind, pk)
    if obj.image:
        obj.image.delete(save=False)
        obj.image = ""
        obj.save(update_fields=["image"])
    return JsonResponse({"ok": True})
