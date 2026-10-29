import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'

export default function LeafletMap({ dest }) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [localTime, setLocalTime] = useState(null)

  useEffect(() => {
    if (!dest || !mapContainerRef.current) return

    const Leaflet = (typeof window !== 'undefined' && window.L) ? window.L : L
    if (!Leaflet) return

    // If map already exists, remove it before reinitializing
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const cities = dest
      .split(/\s+to\s+|\s+and\s+|,\s*/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 2 && !/^(trip|vacation|tour|holiday)$/i.test(s))

    const targets = cities.length > 0 ? cities : [dest]

    const map = Leaflet.map(mapContainerRef.current, { scrollWheelZoom: false })
    mapInstanceRef.current = map

    Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    const geocodePromises = targets.map((cityName) =>
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          cityName
        )}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
        .then((res) => res.json())
        .then((data) => {
          if (data && data.length > 0) {
            return {
              name: cityName,
              lat: parseFloat(data[0].lat),
              lon: parseFloat(data[0].lon),
            }
          }
          return null
        })
        .catch(() => null)
    )

    let isMounted = true

    Promise.all(geocodePromises)
      .then((points) => {
        if (!isMounted || !mapInstanceRef.current) return
        const valid = points.filter(Boolean)

        if (valid.length > 0) {
          try {
            const destLon = valid[0].lon
            const offsetHours = Math.round(destLon / 15)
            const now = new Date()
            const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
            const destDate = new Date(utcMs + offsetHours * 3600000)
            const hrs = String(destDate.getHours()).padStart(2, '0')
            const mins = String(destDate.getMinutes()).padStart(2, '0')
            const sign = offsetHours >= 0 ? '+' : ''
            setLocalTime(`🕒 Local Time: ${hrs}:${mins} (UTC${sign}${offsetHours})`)
          } catch (e) {
            // ignore
          }
        }

        if (valid.length === 0) {
          map.setView([20.0, 0.0], 2)
          return
        }

        const coords = []
        valid.forEach((pt, idx) => {
          coords.push([pt.lat, pt.lon])
          const marker = Leaflet.marker([pt.lat, pt.lon]).addTo(map)
          const badge = valid.length > 1 ? `Stop ${idx + 1}: ` : ''
          marker.bindPopup(`<b>${badge}${pt.name}</b>`).openPopup()
        })

        if (coords.length > 1) {
          Leaflet.polyline(coords, {
            color: '#0d9488',
            dashArray: '6, 8',
            weight: 3,
            opacity: 0.85,
          }).addTo(map)
          map.fitBounds(Leaflet.latLngBounds(coords), { padding: [35, 35] })
        } else {
          map.setView(coords[0], 11)
        }
      })
      .catch(() => {
        if (isMounted && mapInstanceRef.current) {
          mapInstanceRef.current.setView([20.0, 0.0], 2)
        }
      })

    return () => {
      isMounted = false
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [dest])

  if (!dest) return null

  return (
    <div className="destination-map-wrap">
      <div className="destination-map-head">
        <span>📍 Interactive Destination Map — {dest}</span>
        <small>OpenStreetMap • Pinch / Scroll to Zoom</small>
        {localTime && <span className="dest-time-badge">{localTime}</span>}
      </div>
      <div className="destination-map-frame" ref={mapContainerRef} style={{ height: '320px' }}></div>
    </div>
  )
}
