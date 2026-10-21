import type { Page } from "../App"
import Brand from "./Brand"

type HeaderProps = {
  navigate: (page: Page) => void
  brandingOnly?: boolean
}

export default function Header({
  navigate,
  brandingOnly = false,
}: HeaderProps) {
  return (
    <header className="site-header">
      {brandingOnly ? (
        <Brand inverse />
      ) : (
        <button
          className="brand-button"
          onClick={() => navigate("home")}
          aria-label="Go to homepage"
        >
          <Brand inverse />
        </button>
      )}
      {!brandingOnly && (
        <>
          <nav className="main-nav" aria-label="Main navigation">
            <a href="/#about">About</a>
            <a href="/#services">Services</a>
            <a href="/#features">Features</a>
            <a href="/#contact">Contact</a>
          </nav>
          <div className="header-actions">
            <button
              className="button button--outline-light"
              onClick={() => navigate("login")}
            >
              Log in
            </button>
            <button
              className="button button--light"
              onClick={() => navigate("register")}
            >
              Register
            </button>
          </div>
        </>
      )}
    </header>
  )
}
