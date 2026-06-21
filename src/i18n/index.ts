import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ptBR from "./pt-BR.json";
import enUS from "./en-US.json";

const saved = localStorage.getItem("lang");
const browser = navigator.language.startsWith("pt") ? "pt-BR" : "en-US";

i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: ptBR },
    "en-US": { translation: enUS },
  },
  lng: saved ?? browser,
  fallbackLng: "en-US",
  interpolation: { escapeValue: false },
});

export default i18n;
