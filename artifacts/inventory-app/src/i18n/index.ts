import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import ru from "./locales/ru.json";

export type LanguagePreference = "en" | "ru" | "auto";

export function getLanguagePreference(): LanguagePreference {
  const stored = localStorage.getItem("sk_language");
  return stored === "en" || stored === "ru" ? stored : "auto";
}

function browserLanguage(): "en" | "ru" {
  for (const locale of navigator.languages) {
    const language = locale.split("-")[0];
    if (language === "en" || language === "ru") return language;
  }
  return "en";
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "ru"],
    detection: {
      order:
        getLanguagePreference() === "auto"
          ? ["navigator"]
          : ["localStorage", "navigator"],
      lookupLocalStorage: "sk_language",
      // Store the preference, not the language resolved from an auto choice.
      caches: [],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

export function setLanguage(lang: LanguagePreference) {
  localStorage.setItem("sk_language", lang);
  void i18n.changeLanguage(lang === "auto" ? browserLanguage() : lang);
}
