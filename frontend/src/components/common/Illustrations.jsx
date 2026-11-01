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

export function BusIllustration() {
  return (
    <div className="illustration-bus-wrap" aria-hidden="true">
      <img className="bus-svg" src={busImage} alt="" />
      <div className="bus-road-line"></div>
    </div>
  )
}
