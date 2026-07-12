import { Link } from "react-router-dom";
import { useLocale } from "../i18n";
import "./RouteErrorPage.css";

export function RouteErrorPage() {
  const { text } = useLocale();
  return (
    <main className="route-error-page">
      <section className="route-error-card">
        <p className="route-error-card__eyebrow">{text("Ошибка приложения", "Application error")}</p>
        <h1>{text("Что-то пошло не так", "Something went wrong")}</h1>
        <p>{text("Попробуйте обновить страницу или вернуться на главный экран.", "Refresh the page or return to the main workspace.")}</p>
        <div className="route-error-card__actions">
          <button className="button button--green" type="button" onClick={() => window.location.reload()}>
            {text("Обновить страницу", "Refresh page")}
          </button>
          <Link className="button" to="/dashboard">
            {text("На главную", "Go to dashboard")}
          </Link>
        </div>
      </section>
    </main>
  );
}
