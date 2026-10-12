import logo from "../assets/valencia/logo-source.png"

type BrandProps = {
  compact?: boolean
  inverse?: boolean
}

export default function Brand({
  compact = false,
  inverse = false,
}: BrandProps) {
  return (
    <div
      className={`brand ${compact ? "brand--compact" : ""} ${
        inverse ? "brand--inverse" : ""
      }`}
    >
      <img
        className="brand__mark"
        src={logo}
        alt="Valencia Construction Services"
      />
      <div>
        <div className="brand__name">
          {compact ? "BuildTrack" : "Valencia Construction Services"}
        </div>
        <div className="brand__tag">
          {compact ? "Valencia Construction Services" : "Powered by BuildTrack"}
        </div>
      </div>
    </div>
  )
}
