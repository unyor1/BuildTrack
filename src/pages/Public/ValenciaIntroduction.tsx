import { useEffect, useState, type FormEvent } from "react"
import type { Page } from "../../App"
import Header from "../../components/Header"
import Brand from "../../components/Brand"
import Icon from "../../components/Icons"
import Modal from "../../components/Modal"
import { companyHeaderNavigation, companyInquiryMailto, companySections, valenciaCompany as company, valenciaProcess, valenciaProjects, valenciaServices } from "./valenciaContent"
import "./valencia.css"

type ProjectFilter = "All projects" | "Residential" | "Sales offices" | "Commercial"
const filters: ProjectFilter[] = ["All projects", "Residential", "Sales offices", "Commercial"]
const Arrow = () => <span aria-hidden="true">↗</span>

export default function ValenciaIntroduction({ navigate }: { navigate: (page: Page) => void }) {
  const [filter, setFilter] = useState<ProjectFilter>("All projects")
  const [projectId, setProjectId] = useState<string | null>(null)
  const [slide, setSlide] = useState(0)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [emailPrepared, setEmailPrepared] = useState(false)
  const project = valenciaProjects.find(item => item.id === projectId)
  const projects = valenciaProjects.filter(item => filter === "All projects" || item.category === filter)

  useEffect(() => {
    const title = document.title
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescription = description?.content
    document.title = "Valencia Construction Services | Built on Commitment"
    if (description) description.content = "Get to know Valencia Construction Services: civil and architectural works, commercial fit-outs, sales offices and featured projects in the Philippines."
    return () => {
      document.title = title
      if (description && previousDescription !== undefined) description.content = previousDescription
    }
  }, [])

  const openProject = (id: string) => { setSlide(0); setProjectId(id) }
  const changeSlide = (direction: number) => {
    if (project) setSlide(value => (value + direction + project.photos.length) % project.photos.length)
  }
  const prepareInquiry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) return
    window.location.href = companyInquiryMailto(name, email, message)
    setEmailPrepared(true)
  }

  return (
    <div className="landing valencia-page">
      <a className="valencia-skip" href="#valencia-main">Skip to company introduction</a>
      <Header navigate={navigate} navigation={companyHeaderNavigation} showAuthActions={false} brandPage="valencia" />
      <nav className="valencia-mobile-nav" aria-label="Company sections">
        {companyHeaderNavigation.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <main id="valencia-main">
        <section className="valencia-hero" aria-labelledby="valencia-title">
          <img className="valencia-hero__photo" src={company.interior} alt="Light-filled Southlinks interior with full-height windows and sculptural pendant lights" fetchPriority="high" width={1448} height={1086} />
          <div className="valencia-hero__wash" aria-hidden="true" />
          <div className="valencia-hero__identity"><img src={company.logo} alt="Valencia Construction Services logo" width={1470} height={1070} /></div>
          <div className="valencia-hero__content">
            <p className="valencia-eyebrow valencia-eyebrow--light"><span /> Spaces with purpose. Work with care.</p>
            <h1 id="valencia-title">Built on<br />commitment.<br /><span>Delivered<br className="valencia-hero__break" /> with quality.</span></h1>
            <p className="valencia-hero__intro">From the first plan to the finishing detail, Valencia Construction Services brings your spaces to life.</p>
            <div className="valencia-actions">
              <a className="button button--gold" href="#valencia-projects">Explore our work <Arrow /></a>
              <a className="button button--outline-light" href="#valencia-contact">Let's build together <Arrow /></a>
            </div>
          </div>
          <div className="valencia-hero__caption"><span className="valencia-dot" /> Southlinks Estate · Interior showcase <span>01 / Valencia</span></div>
        </section>

        <div className="valencia-disciplines" aria-label="Construction disciplines">
          {["Civil works", "Architectural works", "Commercial fit-outs", "Sales offices"].map(item => <span key={item}>{item}<span aria-hidden="true">✦</span></span>)}
        </div>

        <section className="valencia-section valencia-about" id="valencia-about" aria-labelledby="valencia-about-title">
          <div className="valencia-about__visual">
            <img src={company.southlinks} alt="Southlinks Estate sales-office exterior with landscaped grounds" loading="lazy" width={2048} height={1536} />
            <div className="valencia-about__label"><span>From concept</span><strong>to a space that works.</strong><Arrow /></div>
          </div>
          <div className="valencia-about__copy">
            <p className="valencia-eyebrow">01 / Get to know Valencia</p>
            <h2 id="valencia-about-title">Good spaces begin<br />with <em>good foundations.</em></h2>
            <p>We deliver construction and fit-out work with a focus on the people who will use the finished space. Sound materials, skilled workmanship and careful attention to standards guide our approach.</p>
            <p>Our commitment is to safe execution, agreed schedules and budgets, and clear conversations throughout the project. Listening to feedback is part of building lasting client relationships.</p>
            <div className="valencia-values">
              <span><Icon name="shield" /> Quality workmanship</span>
              <span><Icon name="people" /> Client-focused service</span>
              <span><Icon name="building" /> Safe site practice</span>
            </div>
            <div className="valencia-proprietor"><img src={company.proprietorPhoto} alt={`${company.proprietor}, proprietor of Valencia Construction Services`} width={422} height={643} loading="lazy" /><div><strong>{company.proprietor}</strong><small>Proprietor · Valencia Construction Services</small></div></div>
          </div>
        </section>

        <section className="valencia-section valencia-services" id="valencia-services" aria-labelledby="valencia-services-title">
          <div className="valencia-section-head"><div><p className="valencia-eyebrow">02 / What we do</p><h2 id="valencia-services-title">Your vision.<br /><em>Our craft.</em></h2></div><p>Functional spaces, thoughtful finishes and dependable construction—built around your project.</p></div>
          <div className="valencia-service-grid">
            {valenciaServices.map(service => <article className="valencia-service" key={service.number}>
              <div className="valencia-service__top"><span>{service.number}</span><Icon name={service.icon} /></div>
              <h3>{service.title}</h3><p>{service.description}</p><a href="#valencia-contact" aria-label={`Discuss ${service.title.toLowerCase()} with Valencia`}>Discuss your project <Arrow /></a>
            </article>)}
          </div>
          <div className="valencia-safety"><Icon name="shield" /><p><strong>A workforce prepared for the job.</strong> Skilled tradespeople, appropriate PPE and site safety practices support careful, coordinated execution.</p></div>
        </section>

        <section className="valencia-section valencia-projects" id="valencia-projects" aria-labelledby="valencia-projects-title">
          <div className="valencia-section-head"><div><p className="valencia-eyebrow">03 / Selected work</p><h2 id="valencia-projects-title">Plans made tangible.<br /><em>Details made personal.</em></h2></div><p>A closer look at the residences, sales spaces and commercial projects featured in our company portfolio.</p></div>
          <div className="valencia-filters" role="group" aria-label="Filter featured projects">{filters.map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
          <p className="valencia-sr" role="status">{projects.length} featured {projects.length === 1 ? "project" : "projects"}</p>
          <div className="valencia-project-grid">
            {projects.map(item => <article className="valencia-project" key={item.id}>
              <button type="button" className="valencia-project__photo" onClick={() => openProject(item.id)} aria-label={`View ${item.name} photos and details`}>
                <img src={item.photos[0].src} alt={item.photos[0].caption} loading="lazy" width={1200} height={800} />
                <span className="valencia-project__tag">{item.category}</span><span className="valencia-project__open" aria-hidden="true">↗</span>
              </button>
              <div className="valencia-project__body"><h3><button type="button" onClick={() => openProject(item.id)}>{item.name}</button></h3><p>{item.description}</p>{item.sourceStatus ? <small><span className="valencia-dot" />{item.sourceStatus}</small> : null}</div>
            </article>)}
          </div>
          <p className="valencia-source-note">Portfolio and status descriptions are from the <a href={`${company.source}3`} target="_blank" rel="noopener noreferrer">company website <Arrow /></a>, checked October 21, 2026. Perspectives are labelled separately from site photographs.</p>
        </section>

        <section className="valencia-section valencia-process" id="valencia-process" aria-labelledby="valencia-process-title">
          <div className="valencia-section-head"><div><p className="valencia-eyebrow valencia-eyebrow--light">04 / How we build</p><h2 id="valencia-process-title">Crafting structures.<br /><em>Delivering results.</em></h2></div><p>Careful preparation and a coordinated team turn the plan into purposeful work on site.</p></div>
          <div className="valencia-process-grid">{valenciaProcess.map(step => <article key={step.number}>
            <div className="valencia-process__photo"><img src={step.image} alt={`${step.title} — Valencia project development`} loading="lazy" width={1000} height={800} /><span>{step.number}</span></div>
            <h3>{step.title}</h3><p>{step.description}</p>
          </article>)}</div>
          <div className="valencia-team-note"><Icon name="people" /><p><strong>The people behind the finish.</strong> Our tradespeople bring the plan to life through practical skill, craftsmanship and attention to detail.</p></div>
        </section>

        <section className="valencia-section valencia-contact" id="valencia-contact" aria-labelledby="valencia-contact-title">
          <div className="valencia-contact__info">
            <p className="valencia-eyebrow">05 / Start a conversation</p><h2 id="valencia-contact-title">A new space starts<br />with <em>a conversation.</em></h2><p>Tell us what you have in mind. Visit our Taytay office or reach out during business hours to discuss your project.</p>
            <dl>
              <div><dt><Icon name="building" /> Visit our office</dt><dd>{company.address}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(company.address)}`} target="_blank" rel="noopener noreferrer">Find this address on Maps <Arrow /></a></dd></div>
              <div><dt><Icon name="phone" /> Call us</dt><dd>{company.phones.map(phone => <a key={phone} href={`tel:${phone}`}>{phone}</a>)}</dd></div>
              <div><dt><Icon name="mail" /> Email us</dt><dd><a href={`mailto:${company.email}`}>{company.email}</a></dd></div>
              <div><dt>Office hours</dt><dd>{company.hours}<small>Philippine time</small></dd></div>
            </dl>
          </div>
          <form className="valencia-inquiry" onSubmit={prepareInquiry}>
            <span className="valencia-eyebrow">Let's build together <Arrow /></span><h3>Tell us about your project</h3>
            <label htmlFor="valencia-name">Your name</label><input id="valencia-name" name="name" autoComplete="name" maxLength={150} value={name} onChange={event => {setName(event.target.value);setEmailPrepared(false)}} required placeholder="Full name" />
            <label htmlFor="valencia-email">Email address</label><input id="valencia-email" name="email" type="email" autoComplete="email" maxLength={254} value={email} onChange={event => {setEmail(event.target.value);setEmailPrepared(false)}} required placeholder="you@example.com" />
            <label htmlFor="valencia-message">What would you like to build?</label><textarea id="valencia-message" name="message" rows={5} maxLength={4000} value={message} onChange={event => {setMessage(event.target.value);setEmailPrepared(false)}} required placeholder="Project type, location and what you have in mind…" />
            <button type="submit" className="button valencia-button--brand">Prepare email inquiry <Arrow /></button>
            <p className="valencia-inquiry__note" role="status">{emailPrepared ? "Your email app has been requested. Review and send the message there; it has not been submitted by this website." : "Opens your email app with your details. Nothing is stored or sent until you send the email."}</p>
            <a className="valencia-inquiry__fallback" href={`mailto:${company.email}`}>Prefer to email directly? <Arrow /></a>
          </form>
        </section>

        <section className="valencia-buildtrack" aria-labelledby="valencia-buildtrack-title"><div><span className="valencia-eyebrow">Connected construction</span><h2 id="valencia-buildtrack-title">Meet the platform behind the progress.</h2><p>Explore BuildTrack's blueprint-linked progress, quality workflows and workforce tools.</p></div><button className="button button--outline-light" type="button" onClick={() => navigate("home")}>Explore BuildTrack <Arrow /></button></section>
      </main>

      <footer className="site-footer valencia-footer"><div className="valencia-footer__top"><div><Brand inverse /><p>Construction and fit-out services.<br />Built on commitment. Delivered with quality.</p></div><nav aria-label="Company footer">{companySections.map(link => <a href={link.href} key={link.href}>{link.label}</a>)}</nav><div><strong>Stay connected</strong><p>For project updates and more about Valencia, visit our original company website.</p><a href={company.source} target="_blank" rel="noopener noreferrer">Visit Valencia's website <Arrow /></a></div></div><div className="site-footer__bottom"><span>© {new Date().getFullYear()} {company.name}.</span><button type="button" onClick={() => navigate("home")}>Powered by BuildTrack ↗</button></div></footer>

      {project ? <Modal title={project.name} description={`${project.category} · Valencia company portfolio`} size="2xl" onClose={() => setProjectId(null)} footer={<button className="button valencia-button--brand" type="button" onClick={() => setProjectId(null)}>Close gallery</button>}>
        <div className="valencia-gallery" role="region" aria-label={`${project.name} photo slideshow`} tabIndex={0} onKeyDown={event => {if(event.target !== event.currentTarget) return;if(event.key === "ArrowLeft") {event.preventDefault();changeSlide(-1)} else if(event.key === "ArrowRight") {event.preventDefault();changeSlide(1)}}}>
          <img className="valencia-gallery__image" src={project.photos[slide].src} alt={project.photos[slide].caption} />
          <div className="valencia-gallery__controls">{project.photos.length > 1 ? <button type="button" onClick={() => changeSlide(-1)} aria-label="Previous project photo">← Previous</button> : <span />}
            <span aria-live="polite">Image {slide + 1} of {project.photos.length}</span>{project.photos.length > 1 ? <button type="button" onClick={() => changeSlide(1)} aria-label="Next project photo">Next →</button> : <span />}</div>
          <p className="valencia-gallery__caption">{project.photos[slide].caption}</p>
          {project.photos.length > 1 ? <div className="valencia-gallery__thumbs" role="group" aria-label="Choose project photo">{project.photos.map((photo, index) => <button type="button" key={photo.src} aria-label={`Show photo ${index + 1}: ${photo.caption}`} aria-pressed={slide === index} onClick={() => setSlide(index)}><img src={photo.src} alt="" /></button>)}</div> : null}
          <p>{project.description}</p>{project.sourceStatus ? <p className="valencia-source-note">{project.sourceStatus} · checked October 21, 2026.</p> : null}
        </div>
      </Modal> : null}
    </div>
  )
}
