import { Link } from "react-router-dom";
import "./RouteErrorPage.css";

export function RouteErrorPage() {
  return (
    <main className="route-error-page">
      <section className="route-error-card">
        <p className="route-error-card__eyebrow">Ошибка приложения</p>
        <h1>Что-то пошло не так</h1>
        <p>Попробуйте обновить страницу или вернуться на главный экран.</p>
        <div className="route-error-card__actions">
          <button className="button button--green" type="button" onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
          <Link className="button" to="/dashboard">
            На главную
          </Link>
        </div>
      </section>
    </main>
  );
}
