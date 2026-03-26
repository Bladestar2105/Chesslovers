import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      "Play Chess": "Play Chess",
      "Play vs CPU": "Play vs CPU",
      "Play Random": "Play Random",
      "Play a Friend": "Play a Friend",
      "Difficulty": "Difficulty",
      "Time Control": "Time Control",
      "Start Game": "Start Game",
      "Waiting for opponent...": "Waiting for opponent...",
      "Resign": "Resign",
      "Offer Draw": "Offer Draw",
      "Game Over": "Game Over",
      "You won!": "You won!",
      "You lost.": "You lost.",
      "Draw": "Draw",
      "Replays": "Replays",
      "Home": "Home",
      "Theme": "Theme",
      "Language": "Language",
      "White": "White",
      "Black": "Black",
      "Result": "Result",
      "View": "View"
    }
  },
  de: {
    translation: {
      "Play Chess": "Schach Spielen",
      "Play vs CPU": "Gegen CPU spielen",
      "Play Random": "Zufälliger Gegner",
      "Play a Friend": "Gegen Freund spielen",
      "Difficulty": "Schwierigkeit",
      "Time Control": "Bedenkzeit",
      "Start Game": "Spiel starten",
      "Waiting for opponent...": "Warte auf Gegner...",
      "Resign": "Aufgeben",
      "Offer Draw": "Remis anbieten",
      "Game Over": "Spielende",
      "You won!": "Du hast gewonnen!",
      "You lost.": "Du hast verloren.",
      "Draw": "Unentschieden",
      "Replays": "Wiederholungen",
      "Home": "Startseite",
      "Theme": "Design",
      "Language": "Sprache",
      "White": "Weiß",
      "Black": "Schwarz",
      "Result": "Ergebnis",
      "View": "Ansehen"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "en", // default language
    fallbackLng: "en",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
