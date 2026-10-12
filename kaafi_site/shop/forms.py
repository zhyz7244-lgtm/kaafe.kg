import re

from django import forms

from .models import Book, Customer, Review


def _digits(value):
    return re.sub(r"\D", "", value or "")


class ReviewForm(forms.ModelForm):
    class Meta:
        model = Review
        fields = ["name", "rating", "text"]
        labels = {"name": "Ваше имя", "rating": "Оценка", "text": "Отзыв"}
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "Как вас зовут", "maxlength": 60}),
            "rating": forms.HiddenInput(),
            "text": forms.Textarea(
                attrs={
                    "rows": 4,
                    "placeholder": "Расскажите, как вам у нас (необязательно, если прикладываете фото)",
                    "maxlength": 1000,
                }
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Оценку выбирает сам гость: заранее пять звёзд не ставим.
        self.fields["rating"].initial = None
        self.fields["rating"].required = True
        self.fields["rating"].error_messages["required"] = "Поставьте оценку звёздами."
        self.fields["text"].required = False


class BookOrderForm(forms.Form):
    book = forms.ModelChoiceField(queryset=Book.objects.filter(is_available=True), widget=forms.HiddenInput)
    qty = forms.IntegerField(label="Количество", min_value=1, max_value=20, initial=1)
    name = forms.CharField(label="Ваше имя", max_length=100)
    phone = forms.CharField(label="Номер телефона", max_length=30)
    country = forms.CharField(label="Страна", max_length=60, initial="Кыргызстан")
    city = forms.CharField(label="Город", max_length=60, initial="Бишкек")
    address = forms.CharField(label="Адрес", max_length=200)

    def clean_phone(self):
        phone = self.cleaned_data["phone"].strip()
        if len(_digits(phone)) < 9:
            raise forms.ValidationError("Укажите корректный номер телефона.")
        return phone


class RegisterForm(forms.Form):
    name = forms.CharField(label="Ваше имя", max_length=60)
    phone = forms.CharField(label="Номер телефона", max_length=30)
    password = forms.CharField(label="Пароль", min_length=6, max_length=128, widget=forms.PasswordInput)

    def clean_phone(self):
        phone = _digits(self.cleaned_data["phone"])
        if not 9 <= len(phone) <= 15:
            raise forms.ValidationError("Укажите корректный номер телефона.")
        if Customer.objects.filter(phone=phone).exists():
            raise forms.ValidationError("Этот номер уже зарегистрирован — войдите.")
        return phone


class LoginForm(forms.Form):
    phone = forms.CharField(label="Номер телефона", max_length=30)
    password = forms.CharField(label="Пароль", max_length=128, widget=forms.PasswordInput)

    def clean_phone(self):
        return _digits(self.cleaned_data["phone"])
