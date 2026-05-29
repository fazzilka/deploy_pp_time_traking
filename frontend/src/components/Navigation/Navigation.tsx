import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../shared/api/profile";
import { logout } from "../../shared/api/auth";
import { getAvatarColor } from "../../shared/utils/avatar";
import type { User } from "../../shared/types/user";
import "./Navigation.css";

export function Navigation() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let isMounted = true;

    getCurrentUser()
      .then((currentUser) => {
        if (isMounted) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function handleLogout() {
    logout();
    navigate("/auth", { replace: true });
  }

  const avatarLabel = user?.avatar_letter || user?.username.slice(0, 1).toUpperCase() || "T";
  const avatarColor = getAvatarColor(user?.username || "time-tracking");

  return (
    <header className="navigation">
      <div className="navigation__inner app-container">
        <div className="navigation__brand">Time Tracking</div>

        <nav className="navigation__links" aria-label="Основная навигация">
          <NavLink to="/dashboard">Таймер</NavLink>
          <NavLink to="/reports">Отчёты</NavLink>
          <NavLink to="/profile">Профиль</NavLink>
        </nav>

        <div className="navigation__user">
          <button
            className="navigation__avatar"
            type="button"
            style={{ backgroundColor: avatarColor }}
            aria-label="Профиль пользователя"
            onClick={() => navigate("/profile")}
          >
            {avatarLabel}
          </button>
          <button className="navigation__logout" type="button" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </div>
    </header>
  );
}
