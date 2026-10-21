import type { Page } from "../App"
import Brand from "./Brand"

type HeaderProps = {
  navigate: (page: Page) => void
  brandingOnly?: boolean
  navigation?: { label: string; href: string }[]
}

export default function Header({
  navigate,
  brandingOnly = false,
  navigation,
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
            {(navigation ?? [
              { label: "Valencia", href: "/valencia" },
              { label: "About", href: "/#about" },
              { label: "Services", href: "/#services" },
              { label: "Features", href: "/#features" },
              { label: "Contact", href: "/#contact" },
            ]).map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
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
