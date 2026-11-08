import airplaneImage from '../../pages/images/c59d7b69de7553485c26ae0af2488ce1a01ca0f1.png'
import cloudImage from '../../pages/images/image 11.png'
import busImage from '../../pages/images/image 6.png'

export function AirplaneIllustration() {
  return (
    <div
      className="illustration-airplane"
      role="img"
      aria-label="Blue airplane illustration"
      style={{ backgroundImage: `url("${airplaneImage}")` }}
    >
      <img className="illustration-cloud" src={cloudImage} alt="" />
    </div>
  )
}

export function TravelSkyIllustration() {
  return (
    <div className="travel-sky" role="img" aria-label="Airplane flying through clouds">
      <span className="travel-sky-path" aria-hidden="true" />
      <img className="travel-sky-cloud travel-sky-cloud-a" src={cloudImage} alt="" />
      <img className="travel-sky-cloud travel-sky-cloud-b" src={cloudImage} alt="" />
      <img className="travel-sky-plane" src={airplaneImage} alt="" />
    </div>
  )
}

export function BusIllustration({ progress = 0 }) {
  const position = Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div className="bus-progress" role="progressbar" aria-label="Form completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={position}>
      <div className="bus-motion-lane" aria-hidden="true">
        <img className="bus-progress-image" src={busImage} alt="" style={{ left: `${position}%` }} />
      </div>
      <div className="bus-progress-track" aria-hidden="true"><span style={{ width: `${position}%` }} /></div>
    </div>
  )
}
