import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

const GUIDES = {
  france: {
    lang: 'fr-FR',
    emergency: { police: '17', medical: '15', general: '112' },
    currency: 'EUR (€) — Cards widely accepted (Visa/Mastercard, Apple Pay)',
    tipping: 'Service is included by law (service compris). 5% to 10% is customary for great sit-down service.',
    plugs: 'Type C & E • 230V • 50Hz (Standard European round pins)',
    esim: 'Airalo, Orange Holiday Europe or Free Mobile eSIM',
    phrases: [
      { local: 'Bonjour', en: 'Hello / Good morning', phonetic: 'bohn-zhoor' },
      { local: 'Merci beaucoup', en: 'Thank you very much', phonetic: 'mair-see boh-koo' },
      { local: 'Combien ça coûte ?', en: 'How much does this cost?', phonetic: 'kohm-byan sah koot' },
      { local: 'Où est le métro ?', en: 'Where is the metro?', phonetic: 'oo ay luh may-troh' },
      { local: 'L’addition, s’il vous plaît', en: 'The check, please', phonetic: 'lah-dee-syon seel voo pleh' },
      { local: 'Parlez-vous anglais ?', en: 'Do you speak English?', phonetic: 'par-lay voo ahn-gleh' },
    ],
  },
  japan: {
    lang: 'ja-JP',
    emergency: { police: '110', medical: '119', general: '110 / 119' },
    currency: 'JPY (¥) — Cash is still widely preferred in smaller eateries & temples; IC cards (Suica/Pasmo) for transit',
    tipping: 'No tipping! Tipping is not customary in Japan and can be considered awkward or confusing.',
    plugs: 'Type A & B • 100V • 50/60Hz (2-flat prongs, same as US without ground pin)',
    esim: 'Ubigi, Airalo Moshi Moshi or Sakura Mobile',
    phrases: [
      { local: 'Konnichiwa (こんにちは)', en: 'Hello / Good day', phonetic: 'kohn-nee-chee-wah' },
      { local: 'Arigatou gozaimasu (ありがとうございます)', en: 'Thank you very much', phonetic: 'ah-ree-gah-toh goh-zeye-mahs' },
      { local: 'Ikura desu ka? (いくらですか)', en: 'How much is it?', phonetic: 'ee-koo-rah des kah' },
      { local: 'Eki wa doko desu ka? (駅はどこですか)', en: 'Where is the station?', phonetic: 'eh-kee wah doh-koh des kah' },
      { local: 'Sumimasen (すみません)', en: 'Excuse me / Sorry', phonetic: 'soo-mee-mah-sen' },
      { local: 'Okaikei onegaishimasu (お会計お願いします)', en: 'The bill, please', phonetic: 'oh-kye-kay oh-neh-guy-she-mahs' },
    ],
  },
  italy: {
    lang: 'it-IT',
    emergency: { police: '113', medical: '118', general: '112' },
    currency: 'EUR (€) — Contactless cards widely accepted; keep €10-20 cash for espresso & small gelaterias',
    tipping: 'Coperto (cover charge) is normal on the bill. Rounding up or leaving €1-2 per person for good service is plenty.',
    plugs: 'Type C, F & L • 230V • 50Hz (Universal European adapter recommended)',
    esim: 'Airalo, TIM Tourist or Iliad eSIM',
    phrases: [
      { local: 'Buongiorno', en: 'Good morning / Hello', phonetic: 'bwon-zhor-no' },
      { local: 'Grazie mille', en: 'Thank you very much', phonetic: 'graht-zyeh meel-leh' },
      { local: 'Quanto costa?', en: 'How much is this?', phonetic: 'kwan-toh kos-tah' },
      { local: 'Dov’è il bagno?', en: 'Where is the restroom?', phonetic: 'doh-veh eel bahn-yo' },
      { local: 'Il conto, per favore', en: 'The bill, please', phonetic: 'eel kohn-toh pair fah-voh-reh' },
      { local: 'Vorrei un caffè', en: 'I would like an espresso', phonetic: 'vor-rye oon kahf-feh' },
    ],
  },
  spain: {
    lang: 'es-ES',
    emergency: { police: '091', medical: '061', general: '112' },
    currency: 'EUR (€) — Cards accepted almost everywhere, including street markets and taxis',
    tipping: 'Not obligatory. Leaving 5–10% at casual dinners or rounding up the bill is appreciated.',
    plugs: 'Type C & F • 230V • 50Hz (Standard European round 2-pin)',
    esim: 'Vodafone Spain, Airalo or Orange Holiday',
    phrases: [
      { local: 'Hola, buenos días', en: 'Hello, good morning', phonetic: 'oh-lah bweh-nos dee-ahs' },
      { local: 'Muchas gracias', en: 'Thank you very much', phonetic: 'moo-chahs grah-see-ahs' },
      { local: '¿Cuánto cuesta?', en: 'How much does it cost?', phonetic: 'kwan-toh kwehs-tah' },
      { local: '¿Dónde está la estación?', en: 'Where is the station?', phonetic: 'dohn-deh ehs-tah lah ehs-tah-syohn' },
      { local: 'La cuenta, por favor', en: 'The check, please', phonetic: 'lah kwen-tah por fah-vor' },
      { local: 'Una cerveza, por favor', en: 'A beer, please', phonetic: 'oo-nah sair-veh-sah por fah-vor' },
    ],
  },
  indonesia: {
    lang: 'id-ID',
    emergency: { police: '110', medical: '118', general: '112' },
    currency: 'IDR (Rp) — Cash is king in Bali beach clubs, warungs, and markets; cards accepted at resorts',
    tipping: '5% to 10% is customary in tourist areas, spas, private drivers, and dive guides.',
    plugs: 'Type C & F • 230V • 50Hz (Europlug round 2-pin)',
    esim: 'Telkomsel Tourist eSIM or Airalo Indotel',
    phrases: [
      { local: 'Halo / Selamat pagi', en: 'Hello / Good morning', phonetic: 'hah-loh / seh-lah-maht pah-ghee' },
      { local: 'Terima kasih', en: 'Thank you', phonetic: 'teh-ree-mah kah-see' },
      { local: 'Berapa harganya?', en: 'How much is it?', phonetic: 'beh-rah-pah har-nyah' },
      { local: 'Bisa minta tolong?', en: 'Can you help me?', phonetic: 'bee-sah meen-tah toh-long' },
      { local: 'Minta bon, tolong', en: 'The bill, please', phonetic: 'meen-tah bohn toh-long' },
      { local: 'Sama-sama', en: 'You are welcome', phonetic: 'sah-mah sah-mah' },
    ],
  },
  thailand: {
    lang: 'th-TH',
    emergency: { police: '191 (Tourist Police 1155)', medical: '1669', general: '1155' },
    currency: 'THB (฿) — Always carry ฿500-1000 cash for street food & tuk-tuks',
    tipping: 'Small tips (20–50 THB) appreciated for massage, bellhops, and drivers. 10% in upscale restaurants.',
    plugs: 'Type A, B & C • 220V • 50Hz (Multi-standard compatible)',
    esim: 'AIS Tourist eSIM or DTAC Happy Tourist',
    phrases: [
      { local: 'Sawasdee khrup / ka (สวัสดี)', en: 'Hello', phonetic: 'sah-wahd-dee krup/kah' },
      { local: 'Khop khun khrup / ka (ขอบคุณ)', en: 'Thank you', phonetic: 'kop koon krup/kah' },
      { local: 'Tao rai khrup? (เท่าไหร่)', en: 'How much is it?', phonetic: 'tao rye krup' },
      { local: 'Hong nam yoo tee nai? (ห้องน้ำ)', en: 'Where is the bathroom?', phonetic: 'hong nahm yoo tee nye' },
      { local: 'Mai phet na (ไม่เผ็ด)', en: 'Not spicy, please', phonetic: 'mye pet nah' },
      { local: 'Check bin na khrup (เช็คบิล)', en: 'Check, please', phonetic: 'check bin nah krup' },
    ],
  },
  uae: {
    lang: 'ar-AE',
    emergency: { police: '999', medical: '998', general: '999' },
    currency: 'AED (د.إ) — Highly digital society, Apple Pay and cards accepted virtually everywhere',
    tipping: '10–15% is standard for dining and cab drivers in Dubai & Abu Dhabi.',
    plugs: 'Type G • 230V • 50Hz (British 3-rectangular-pin style)',
    esim: 'Du Tourist eSIM, e& (Etisalat) or Airalo Menalink',
    phrases: [
      { local: 'Marhaban (مرحبا)', en: 'Hello', phonetic: 'mar-hah-bahn' },
      { local: 'Shukran jazeelan (شكرا جزيلا)', en: 'Thank you very much', phonetic: 'shook-ran jah-zee-lan' },
      { local: 'Kam hadha? (كم هذا؟)', en: 'How much is this?', phonetic: 'kam hah-thah' },
      { local: 'Min fadlik (من فضلك)', en: 'Please', phonetic: 'min fahd-lik' },
      { local: 'Al-fatora, law samaht', en: 'The bill, please', phonetic: 'al-fah-too-rah law sah-maht' },
      { local: 'Na\'am / Laa (نعم / لا)', en: 'Yes / No', phonetic: 'nah-ahm / lah' },
    ],
  },
}

function resolveGuide(dest) {
  const d = String(dest || '').toLowerCase()
  if (/japan|tokyo|kyoto|osaka|shibuya|shinjuku/i.test(d)) return { ...GUIDES.japan, name: 'Japan' }
  if (/france|paris|nice|lyon|marseille|provence/i.test(d)) return { ...GUIDES.france, name: 'France' }
  if (/italy|rome|florence|venice|milan|amalfi/i.test(d)) return { ...GUIDES.italy, name: 'Italy' }
  if (/spain|barcelona|madrid|seville|valencia|ibiza/i.test(d)) return { ...GUIDES.spain, name: 'Spain' }
  if (/bali|indonesia|jakarta|ubud|seminyak/i.test(d)) return { ...GUIDES.indonesia, name: 'Indonesia & Bali' }
  if (/thailand|bangkok|phuket|chiang mai|krabi/i.test(d)) return { ...GUIDES.thailand, name: 'Thailand' }
  if (/dubai|uae|abu dhabi|sharjah|emirates/i.test(d)) return { ...GUIDES.uae, name: 'United Arab Emirates' }
  // Default international guide
  return {
    name: dest || 'International',
    lang: 'en-US',
    emergency: { police: '112 / 911', medical: '112 / 911', general: '112' },
    currency: 'Local Currency — Keep 2 credit cards (no foreign transaction fee) & small local cash',
    tipping: 'Check local restaurants: 5–10% typical for full sit-down service in international travel hubs.',
    plugs: 'Universal Travel Adapter recommended (Type C/G/A compatible)',
    esim: 'Airalo, Holafly or local airport kiosk provider',
    phrases: [
      { local: 'Hello / Greetings', en: 'Friendly greeting', phonetic: 'Hel-lo' },
      { local: 'Thank you very much', en: 'Polite gratitude', phonetic: 'Thank you' },
      { local: 'How much does this cost?', en: 'Asking for price', phonetic: 'How much is it?' },
      { local: 'Where is the station / restroom?', en: 'Asking directions', phonetic: 'Where is...' },
      { local: 'The check / bill, please', en: 'Requesting dining bill', phonetic: 'The bill, please' },
      { local: 'Do you speak English?', en: 'Language inquiry', phonetic: 'Do you speak English?' },
    ],
  }
}

export default function TravelGuideModal({ isOpen, onClose, dest, onToast }) {
  const [playingIdx, setPlayingIdx] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const guide = resolveGuide(dest)

  const speakPhrase = (text, idx, lang) => {
    if (!('speechSynthesis' in window)) {
      if (onToast) onToast('Audio speech is not supported in this browser.')
      return
    }

    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang || guide.lang || 'en-US'
      utterance.rate = 0.9

      setPlayingIdx(idx)
      utterance.onend = () => setPlayingIdx(null)
      utterance.onerror = () => setPlayingIdx(null)

      window.speechSynthesis.speak(utterance)
    } catch (e) {
      setPlayingIdx(null)
    }
  }

  const copyEmergency = (num, label) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(num)
      if (onToast) onToast(`Copied ${label} number (${num})`)
    }
  }

  return createPortal(
    <div className="modal-portal-wrapper">
      <div className="modal-scrim" onClick={onClose} />
      <div
        className="modal modal-guide glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guideTitle"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-head">
          <div className="modal-heading">
            <span className="modal-category">TRAVEL SURVIVAL DOSSIER</span>
            <h2 id="guideTitle">Culture, Emergency & Local Guide</h2>
            <p className="modal-sub">
              Essential on-the-ground intelligence for {guide.name}: emergency hotlines, tipping customs, audio phrases & connectivity.
            </p>
          </div>
          <button className="icon-btn modal-close" onClick={onClose} type="button" aria-label="Close guide modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body guide-body">
          {/* Emergency Hotlines Row */}
          <div className="guide-section">
            <label className="guide-section-label">🚨 Emergency Contacts</label>
            <div className="guide-emergency-grid">
              <button
                type="button"
                className="guide-emergency-card"
                onClick={() => copyEmergency(guide.emergency.police, 'Police')}
                title="Click to copy emergency number"
              >
                <span className="emergency-icon">👮</span>
                <div className="emergency-info">
                  <strong>Police: {guide.emergency.police}</strong>
                  <small>Tap to copy</small>
                </div>
              </button>

              <button
                type="button"
                className="guide-emergency-card"
                onClick={() => copyEmergency(guide.emergency.medical, 'Ambulance')}
                title="Click to copy emergency number"
              >
                <span className="emergency-icon">🚑</span>
                <div className="emergency-info">
                  <strong>Ambulance: {guide.emergency.medical}</strong>
                  <small>Tap to copy</small>
                </div>
              </button>

              <button
                type="button"
                className="guide-emergency-card"
                onClick={() => copyEmergency(guide.emergency.general, 'General Hotline')}
                title="Click to copy emergency number"
              >
                <span className="emergency-icon">🆘</span>
                <div className="emergency-info">
                  <strong>General: {guide.emergency.general}</strong>
                  <small>Universal SOS</small>
                </div>
              </button>
            </div>
          </div>

          {/* Etiquette & Practical Specs */}
          <div className="guide-specs-grid">
            <div className="guide-spec-box">
              <div className="spec-head">
                <span className="spec-icon">💳</span>
                <strong>Payment & Currency</strong>
              </div>
              <p>{guide.currency}</p>
            </div>

            <div className="guide-spec-box">
              <div className="spec-head">
                <span className="spec-icon">🪙</span>
                <strong>Tipping Customs</strong>
              </div>
              <p>{guide.tipping}</p>
            </div>

            <div className="guide-spec-box">
              <div className="spec-head">
                <span className="spec-icon">🔌</span>
                <strong>Power & Sockets</strong>
              </div>
              <p>{guide.plugs}</p>
            </div>

            <div className="guide-spec-box">
              <div className="spec-head">
                <span className="spec-icon">📶</span>
                <strong>SIM & eSIM Network</strong>
              </div>
              <p>{guide.esim}</p>
            </div>
          </div>

          {/* Local Language Phrases with Audio Pronunciation */}
          <div className="guide-section">
            <div className="guide-phrases-head">
              <label className="guide-section-label">🗣️ Essential Local Phrases</label>
              <span className="guide-phrases-hint">Click 🔊 to hear live audio pronunciation</span>
            </div>

            <div className="guide-phrases-list">
              {guide.phrases.map((p, idx) => (
                <div key={idx} className="guide-phrase-item">
                  <div className="phrase-text-wrap">
                    <strong className="phrase-local">{p.local}</strong>
                    <span className="phrase-phonetic">Pronounce: "{p.phonetic}"</span>
                    <small className="phrase-en">{p.en}</small>
                  </div>

                  <button
                    type="button"
                    className={`btn btn-soft btn-sm phrase-audio-btn ${playingIdx === idx ? 'playing' : ''}`}
                    onClick={() => speakPhrase(p.local.split('(')[0].trim(), idx, guide.lang)}
                    title="Listen to pronunciation"
                  >
                    <span>{playingIdx === idx ? '🔊 Playing...' : '🔊 Pronounce'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Foot */}
        <div className="modal-foot">
          <span className="guide-foot-hint">💡 Offline ready: Take a screenshot or bookmark this guide</span>
          <button className="btn btn-primary btn-sm" type="button" onClick={onClose}>
            Close Guide
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
