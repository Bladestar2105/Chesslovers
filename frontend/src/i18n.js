import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

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
      "View": "View",
      "You": "You",
      "Opponent": "Opponent",
      "Are you sure you want to resign?": "Are you sure you want to resign?",
      "Draw offer sent.": "Draw offer sent.",
      "Opponent offered a draw. Accept?": "Opponent offered a draw. Accept?",
      "Choose Promotion": "Choose Promotion",
      "Cancel": "Cancel",
      "Checkmate! You win!": "Checkmate! You win!",
      "Checkmate! You lose.": "Checkmate! You lose.",
      "Stalemate - Draw": "Stalemate - Draw",
      "Opponent resigned. You win!": "Opponent resigned. You win!",
      "You resigned.": "You resigned.",
      "Opponent ran out of time. You win!": "Opponent ran out of time. You win!",
      "You ran out of time.": "You ran out of time.",
      "CHECK!": "CHECK!",
      "Moves": "Moves",
      "No moves yet": "No moves yet",
      "Finished Games": "Finished Games",
      "Replay Viewer": "Replay Viewer",
      "Back to list": "Back to list",
      "Illegal move": "Illegal move",
      "Connection error": "Connection error"
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
      "View": "Ansehen",
      "You": "Du",
      "Opponent": "Gegner",
      "Are you sure you want to resign?": "Bist du sicher, dass du aufgeben möchtest?",
      "Draw offer sent.": "Remis-Angebot gesendet.",
      "Opponent offered a draw. Accept?": "Gegner bietet Remis an. Annehmen?",
      "Choose Promotion": "Bauernumwandlung wählen",
      "Cancel": "Abbrechen",
      "Checkmate! You win!": "Schachmatt! Du gewinnst!",
      "Checkmate! You lose.": "Schachmatt! Du verlierst.",
      "Stalemate - Draw": "Patt - Unentschieden",
      "Opponent resigned. You win!": "Gegner hat aufgegeben. Du gewinnst!",
      "You resigned.": "Du hast aufgegeben.",
      "Opponent ran out of time. You win!": "Gegners Zeit ist abgelaufen. Du gewinnst!",
      "You ran out of time.": "Deine Zeit ist abgelaufen.",
      "CHECK!": "SCHACH!",
      "Moves": "Züge",
      "No moves yet": "Noch keine Züge",
      "Finished Games": "Beendete Spiele",
      "Replay Viewer": "Spielanzeige",
      "Back to list": "Zurück zur Liste",
      "Illegal move": "Illegaler Zug",
      "Connection error": "Verbindungsfehler"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;