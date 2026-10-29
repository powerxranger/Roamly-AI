import React from 'react'

export default function WeatherWidget({ weatherData, query }) {
  const text = String(weatherData || '')
  const qText = String(query || '')

  let temp = '22°C'
  let mTemp = text.match(/(-?\d+(?:\.\d+)?)\s*°\s*C/i)
  if (!mTemp) mTemp = text.match(/temp(?:erature)?[:\s*]+(-?\d+(?:\.\d+)?)/i)

  if (mTemp) {
    temp = `${Math.round(parseFloat(mTemp[1]))}°C`
  } else {
    if (/summer|july|august|may|june|beach|bali|phuket|dubai/i.test(`${qText} ${text}`)) {
      temp = '29°C'
    } else if (/winter|december|january|february|snow|switzerland|alps/i.test(`${qText} ${text}`)) {
      temp = '6°C'
    } else {
      temp = '22°C'
    }
  }

  const numericTemp = parseInt(temp, 10)

  let condition = 'Sunny & Clear'
  if (/rain|shower|drizzle|storm/i.test(`${text} ${qText}`)) {
    condition = 'Rain Showers'
  } else if (/cloud|overcast/i.test(text)) {
    condition = 'Partly Cloudy'
  } else if (/snow|blizzard/i.test(`${text} ${qText}`)) {
    condition = 'Snow & Cold'
  } else if (/clear|sunny/i.test(text)) {
    condition = 'Clear & Sunny'
  }

  let advice = 'Comfortable walking shoes, breathable cotton layers & sunglasses.'
  if (numericTemp <= 12 || /snow|winter|cold/i.test(`${text} ${qText}`)) {
    advice = 'Pack thermal innerwear, a heavy woollen coat, gloves & waterproof winter boots.'
  } else if (numericTemp >= 27 || /beach|island|tropical|resort/i.test(`${text} ${qText}`)) {
    advice = 'Light breathable linens, swimwear, UV sunglasses, sunhat & high-SPF sunscreen.'
  } else if (/rain|monsoon/i.test(condition)) {
    advice = 'Waterproof trench coat or light rain shell, compact windproof umbrella & slip-resistant footwear.'
  }

  return (
    <div className="weather-strip-wrap">
      <div className="weather-strip-head">
        <div className="weather-strip-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
          </svg>
          <span>Weather & Wardrobe Guide</span>
        </div>
      </div>

      <div className="weather-cards-row">
        <div className="weather-metric-card">
          <span className="weather-metric-label">Avg Temp</span>
          <span className="weather-metric-val">🌡️ {temp}</span>
        </div>
        <div className="weather-metric-card">
          <span className="weather-metric-label">Condition</span>
          <span className="weather-metric-val">🌤️ {condition}</span>
        </div>
        <div className="weather-metric-card">
          <span className="weather-metric-label">Rain Risk</span>
          <span className="weather-metric-val">{/rain/i.test(condition) ? '🌧️ High' : '☀️ Low'}</span>
        </div>
      </div>

      <div className="weather-advice-pill">
        <span>👕</span>
        <span>
          <strong>What to Pack & Wear:</strong> {advice}
        </span>
      </div>
    </div>
  )
}
