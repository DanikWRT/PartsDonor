import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'

// Слот базы -> part-key чертежа
const SLOT_TO_PART = {
  display: 'screen', board: 'board', battery: 'battery', camera: 'camera',
  backcover: 'backglass', speaker: 'speaker', buzzer: 'buzzer', coil: 'coil',
  charging: 'charging', 'btn-power': 'btn-power', 'btn-vol': 'btn-vol-up',
  'mic-bottom': 'mic-bottom',
}

export default function BlueprintExploded({ components = [], meta = {}, back, detailExtra }) {
  const [selectedPart, setSelectedPart] = useState('screen')
  const [hoveredPart, setHoveredPart] = useState(null)
  const [viewMode, setViewMode] = useState('grid')

  const activePart = hoveredPart || selectedPart

  const compByPart = useMemo(() => {
    const map = {}
    ;(components || []).forEach((c) => {
      const slot = (c.slot || c.title || '').toString().toLowerCase().replace(/[^a-z0-9-]/g, '-')
      const key = SLOT_TO_PART[slot] || slot
      map[key] = c
    })
    return map
  }, [components])

  const fmt = (n) => (n || 0).toLocaleString('ru-RU') + ' ₽'
  const modelName = (meta.model || 'iPhone 16').replace(/-/g, ' ')
  const hasComp = (key) => { const c = compByPart[key]; return !!c && c.status !== 'sold' && c.status !== 'hidden' }

  // ===== СТАТИЧЕСКИЕ ДАННЫЕ ИЗ РЕФЕРЕНСА (SVG превью + имена) =====
  const THUMBS = [
    { key: 'screen', name: 'screen', code: '001', avail: true, svg: (
        <svg viewBox="0 0 110 180" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="sG1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1a2440"/>
                <stop offset="50%" stopColor="#0d1628"/>
                <stop offset="100%" stopColor="#060a14"/>
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="102" height="172" rx="16" fill="url(#sG1)" stroke="#2e3543" strokeWidth="1.2"/>
            <rect x="10" y="10" width="90" height="160" rx="10" fill="#060a14" opacity=".8"/>
            <rect x="40" y="18" width="30" height="8" rx="4" fill="#000"/>
            <circle cx="65" cy="22" r="1.8" fill="#1a2440"/>
            <path d="M 4 4 L 106 4 L 106 40 L 4 100 Z" fill="rgba(255,255,255,.06)"/>
          </svg>
      ) },
    { key: 'battery', name: 'battery', code: '002', avail: true, svg: (
        <svg viewBox="0 0 140 90" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="132" height="82" rx="7" fill="#1c202a" stroke="#3a4051"/>
            <path d="M 4 12 Q 4 4 12 4 L 128 4 Q 136 4 136 12 L 136 26 L 4 26 Z" fill="#0d1015"/>
            <text x="14" y="20" fontSize="6" fill="#8a94a8" fontFamily="system-ui" fontWeight="700">Apple</text>
            <rect x="126" y="36" width="10" height="18" rx="2" fill="#3a4051"/>
            <rect x="128" y="39" width="6" height="2.5" fill="#eab308"/>
            <rect x="128" y="44" width="6" height="2.5" fill="#eab308"/>
            <rect x="12" y="34" width="80" height="2.5" rx="1" fill="#4a5468" opacity=".6"/>
            <rect x="12" y="40" width="60" height="2.5" rx="1" fill="#4a5468" opacity=".6"/>
            <rect x="12" y="62" width="50" height="14" rx="2" fill="#0d1015" stroke="#2e3543"/>
            <rect x="14" y="64" width="34" height="10" rx="1" fill="#22c55e" opacity=".85"/>
          </svg>
      ) },
    { key: 'camera', name: 'camera', code: '003', avail: true, svg: (
        <svg viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="lC1" cx="35%" cy="35%">
                <stop offset="0%" stopColor="#5a6880"/>
                <stop offset="35%" stopColor="#252a3a"/>
                <stop offset="100%" stopColor="#050608"/>
              </radialGradient>
            </defs>
            <rect x="4" y="4" width="102" height="102" rx="22" fill="#161a22" stroke="#353c4d"/>
            <circle cx="38" cy="38" r="20" fill="#050608" stroke="#1a1f28"/>
            <circle cx="38" cy="38" r="14" fill="url(#lC1)"/>
            <circle cx="38" cy="38" r="7" fill="#000"/>
            <circle cx="34" cy="34" r="3" fill="#5b8cff" opacity=".55"/>
            <circle cx="72" cy="38" r="20" fill="#050608" stroke="#1a1f28"/>
            <circle cx="72" cy="38" r="14" fill="url(#lC1)"/>
            <circle cx="72" cy="38" r="7" fill="#000"/>
            <circle cx="68" cy="34" r="3" fill="#6ee7b7" opacity=".5"/>
            <circle cx="38" cy="72" r="18" fill="#050608" stroke="#1a1f28"/>
            <circle cx="38" cy="72" r="12" fill="url(#lC1)"/>
            <circle cx="38" cy="72" r="5" fill="#000"/>
            <circle cx="72" cy="72" r="8" fill="#1a1f28" stroke="#353c4d"/>
            <circle cx="72" cy="72" r="4" fill="#f5e6b8"/>
          </svg>
      ) },
    { key: 'coil', name: 'coil', code: '004', avail: true, svg: (
        <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="cu1" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#f0c99a"/>
                <stop offset="50%" stopColor="#c99160"/>
                <stop offset="100%" stopColor="#8a5c30"/>
              </radialGradient>
            </defs>
            <path d="M 60 10 L 60 16 L 40 16 L 40 40 L 55 40 L 55 50 L 75 50 L 75 40 L 90 40 L 90 16 L 78 16 L 78 10 Z"
                  fill="#1a1a1a" stroke="#000" strokeWidth="0.5"/>
            <rect x="58" y="12" width="22" height="6" rx="1" fill="#c9962a"/>
            <circle cx="70" cy="100" r="42" fill="#0d0d0d" stroke="#1a1a1a"/>
            <circle cx="70" cy="100" r="35" fill="none" stroke="url(#cu1)" strokeWidth="2.5"/>
            <circle cx="70" cy="100" r="30" fill="none" stroke="url(#cu1)" strokeWidth="2"/>
            <circle cx="70" cy="100" r="25" fill="none" stroke="url(#cu1)" strokeWidth="2"/>
            <circle cx="70" cy="100" r="20" fill="none" stroke="url(#cu1)" strokeWidth="1.8"/>
            <circle cx="70" cy="100" r="15" fill="none" stroke="url(#cu1)" strokeWidth="1.8"/>
            <rect x="60" y="90" width="20" height="18" rx="2" fill="#0a0a0a" stroke="#333"/>
            <rect x="63" y="93" width="14" height="12" rx="1" fill="#1a1a1a" stroke="#c9962a" strokeWidth="0.5"/>
          </svg>
      ) },
    { key: 'charging', name: 'charging', code: '005', avail: true, svg: (
        <svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
            <path d="M 20 8 L 20 20 L 30 20 L 30 50 L 22 50 L 22 90 L 38 90 L 38 20 L 48 20 L 48 8 Z"
                  fill="#1a1a1a" stroke="#000" strokeWidth="0.5"/>
            <rect x="18" y="4" width="34" height="10" rx="1" fill="#c9962a"/>
            <path d="M 20 90 L 180 90 L 180 150 L 20 150 Z" fill="#1a1a1a" stroke="#000" strokeWidth="0.6"/>
            <line x1="22" y1="100" x2="178" y2="100" stroke="#3a2a08" strokeWidth="0.6" opacity=".7"/>
            <line x1="22" y1="120" x2="178" y2="120" stroke="#3a2a08" strokeWidth="0.6" opacity=".7"/>
            <line x1="22" y1="140" x2="178" y2="140" stroke="#3a2a08" strokeWidth="0.6" opacity=".7"/>
            <rect x="55" y="128" width="65" height="22" rx="3" fill="#c9962a" stroke="#8a5c30" strokeWidth="0.5"/>
            <rect x="60" y="132" width="55" height="14" rx="7" fill="#0a0a0a"/>
            <rect x="63" y="136" width="49" height="2" fill="#c9962a"/>
            <rect x="63" y="140" width="49" height="2" fill="#8a5c30"/>
            <rect x="170" y="100" width="12" height="30" rx="2" fill="#0a0a0a" stroke="#333"/>
            <rect x="173" y="104" width="6" height="22" rx="1" fill="#c9962a" opacity=".8"/>
          </svg>
      ) },
    { key: 'board', name: 'board', code: '006', avail: false, svg: (
        <svg viewBox="0 0 130 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M 6 6 L 124 6 L 124 30 L 105 30 L 105 45 L 124 45 L 124 94 L 6 94 L 6 75 L 22 75 L 22 45 L 6 45 Z"
                  fill="#1e4d38" stroke="#3a7050"/>
            <rect x="16" y="14" width="22" height="22" rx="1" fill="#0a0c10" stroke="#3a4051"/>
            <rect x="46" y="14" width="30" height="18" rx="1" fill="#0a0c10" stroke="#3a4051"/>
            <rect x="84" y="14" width="18" height="18" rx="1" fill="#0a0c10" stroke="#3a4051"/>
            <rect x="16" y="52" width="28" height="28" rx="1" fill="#0a0c10" stroke="#3a4051"/>
            <rect x="52" y="52" width="34" height="20" rx="1" fill="#0a0c10" stroke="#3a4051"/>
          </svg>
      ) },
    { key: 'speaker', name: 'speaker', code: '007', avail: false, svg: (
        <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="112" height="72" rx="10" fill="#0a0c12" stroke="#353c4d"/>
            <circle cx="60" cy="40" r="28" fill="#050608" stroke="#1a1f28"/>
            <circle cx="60" cy="40" r="22" fill="none" stroke="#353c4d" strokeDasharray="2 3"/>
            <circle cx="60" cy="40" r="16" fill="none" stroke="#353c4d" strokeDasharray="2 3"/>
            <circle cx="60" cy="40" r="10" fill="none" stroke="#353c4d" strokeDasharray="2 3"/>
          </svg>
      ) },
    { key: 'buzzer', name: 'buzzer', code: '008', avail: false, svg: (
        <svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="92" height="82" rx="10" fill="#0a0c12" stroke="#353c4d"/>
            <circle cx="50" cy="45" r="26" fill="#050608" stroke="#1a1f28"/>
            <circle cx="50" cy="45" r="18" fill="none" stroke="#353c4d" strokeDasharray="2 3"/>
            <circle cx="50" cy="45" r="10" fill="none" stroke="#353c4d" strokeDasharray="2 3"/>
            <circle cx="50" cy="45" r="4" fill="#353c4d"/>
          </svg>
      ) },
    { key: 'btn-power', name: 'btn-power', code: '009', avail: false, svg: (
        <svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
            <path d="M 50 8 L 50 20 L 40 20 L 40 40 L 30 40 L 30 60 L 40 60 L 40 100 L 50 100 L 50 120 L 60 120 L 60 100 L 70 100 L 70 60 L 60 60 L 60 40 L 70 40 L 70 20 L 60 20 L 60 8 Z"
                  fill="#1a1a1a" stroke="#333" strokeWidth="0.6"/>
            <rect x="42" y="4" width="16" height="8" rx="1" fill="#c9962a"/>
            <rect x="30" y="110" width="40" height="22" rx="3" fill="#1a1a1a" stroke="#c9962a" strokeWidth="0.5"/>
            <line x1="36" y1="120" x2="64" y2="120" stroke="#c9962a" strokeWidth="0.5"/>
            <line x1="36" y1="126" x2="64" y2="126" stroke="#c9962a" strokeWidth="0.5"/>
          </svg>
      ) },
    { key: 'btn-vol-up', name: 'btn-vol-up', code: '010', avail: false, svg: (
        <svg viewBox="0 0 100 160" xmlns="http://www.w3.org/2000/svg">
            <rect x="30" y="20" width="40" height="18" rx="2" fill="#1a1a1a" stroke="#333" strokeWidth="0.5"/>
            <rect x="30" y="55" width="40" height="26" rx="2" fill="#1a1a1a" stroke="#333" strokeWidth="0.5"/>
            <rect x="36" y="62" width="28" height="2" fill="#c9962a"/>
            <rect x="30" y="95" width="40" height="26" rx="2" fill="#1a1a1a" stroke="#333" strokeWidth="0.5"/>
            <rect x="36" y="104" width="28" height="2" fill="#c9962a"/>
            <path d="M 50 18 L 50 8 L 60 8 L 60 130 L 70 130 L 70 140 L 40 140 L 40 130 L 30 130 L 30 8 L 40 8 L 40 18 Z"
                  fill="#1a1a1a" stroke="#333" strokeWidth="0.5" opacity=".7"/>
            <rect x="42" y="4" width="16" height="8" rx="1" fill="#c9962a"/>
            <rect x="42" y="136" width="16" height="8" rx="1" fill="#c9962a"/>
          </svg>
      ) },
    { key: 'mic-bottom', name: 'mic-bottom', code: '011', avail: false, svg: (
        <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="112" height="72" rx="10" fill="#0a0c12" stroke="#353c4d"/>
            <circle cx="20" cy="40" r="3" fill="none" stroke="#4a5468"/>
            <circle cx="30" cy="40" r="3" fill="none" stroke="#4a5468"/>
            <circle cx="40" cy="40" r="3" fill="none" stroke="#4a5468"/>
            <circle cx="50" cy="40" r="3" fill="none" stroke="#4a5468"/>
            <circle cx="60" cy="40" r="3" fill="none" stroke="#4a5468"/>
            <circle cx="70" cy="40" r="3" fill="none" stroke="#4a5468"/>
            <circle cx="80" cy="40" r="3" fill="none" stroke="#4a5468"/>
            <circle cx="90" cy="40" r="3" fill="none" stroke="#4a5468"/>
            <circle cx="100" cy="40" r="3" fill="none" stroke="#4a5468"/>
            <rect x="10" y="24" width="100" height="10" rx="2" fill="none" stroke="#353c4d" strokeDasharray="2 3"/>
          </svg>
      ) },
    { key: 'backglass', name: 'backglass', code: '012', avail: false, svg: (
        <svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="rg1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff3b30"/>
                <stop offset="45%" stopColor="#e81c10"/>
                <stop offset="100%" stopColor="#a30800"/>
              </linearGradient>
              <linearGradient id="rs1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(255,255,255,.35)"/>
                <stop offset="45%" stopColor="rgba(255,255,255,0)"/>
                <stop offset="100%" stopColor="rgba(255,180,180,.25)"/>
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="112" height="192" rx="22" fill="url(#rg1)" stroke="#7a0500"/>
            <rect x="12" y="14" width="58" height="58" rx="16" fill="#5a0800" stroke="#7a0500"/>
            <circle cx="30" cy="32" r="11" fill="#0a0a0a" stroke="#2a2a2a"/>
            <circle cx="30" cy="32" r="7" fill="#5a0800"/>
            <circle cx="28" cy="30" r="2.5" fill="#5b8cff" opacity=".7"/>
            <circle cx="52" cy="32" r="11" fill="#0a0a0a" stroke="#2a2a2a"/>
            <circle cx="52" cy="32" r="7" fill="#5a0800"/>
            <circle cx="30" cy="56" r="10" fill="#0a0a0a" stroke="#2a2a2a"/>
            <circle cx="30" cy="56" r="6" fill="#5a0800"/>
            <circle cx="56" cy="56" r="5" fill="#f5e6b8"/>
            <circle cx="76" cy="110" r="9" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".9"/>
            <path d="M 72 106 Q 76 103 80 106 Q 82 110 80 116 L 76 118 L 72 116 Q 70 110 72 106 Z" fill="#fff" opacity=".9"/>
            <rect x="4" y="4" width="112" height="192" rx="22" fill="url(#rs1)"/>
            <text x="60" y="182" fontSize="6" fill="#7a0500" opacity=".6" textAnchor="middle" fontFamily="system-ui">iPhone</text>
          </svg>
      ) },
  ]

  // ===== СПЕЦИФИКАЦИЯ (имена/цены по умолчанию из референса) =====
  const SPECS = [
    { key: 'screen', name: 'Дисплей в сборе', avail: true },
    { key: 'battery', name: 'Аккумулятор', avail: true },
    { key: 'camera', name: 'Камера основная', avail: true },
    { key: 'coil', name: 'Катушка MagSafe', avail: true },
    { key: 'charging', name: 'Шлейф зарядки USB-C', avail: true },
    { key: 'board', name: 'Плата A18', avail: false },
    { key: 'speaker', name: 'Динамик Speaker', avail: false },
    { key: 'buzzer', name: 'Бузер', avail: false },
    { key: 'btn-power', name: 'Шлейф кнопки Power', avail: false },
    { key: 'btn-vol-up', name: 'Шлейф кнопок громкости', avail: false },
    { key: 'mic-bottom', name: 'Микрофон нижний', avail: false },
    { key: 'backglass', name: 'Задняя крышка', avail: false },
  ]

  // ===== ДЕТАЛЬНЫЕ ПАНЕЛИ =====
  const DETAILS = {
    'screen': (
      <>
        <div className="dp-header">
          <div className="dp-thumb">
            <svg viewBox="0 0 110 180"><rect x="4" y="4" width="102" height="172" rx="16" fill="#1a2440" stroke="#2e3543"/><rect x="40" y="18" width="30" height="8" rx="4" fill="#000"/></svg>
          </div>
          <div>
            <div className="dp-title">Дисплей в сборе</div>
            <div className="dp-seller">🏪 iFix Moscow · <span className="star">★</span> 4.9</div>
          </div>
        </div>
        <div>
          <div className="dp-price">45 000 ₽</div>
          <div className="dp-note">в наличии · 1 шт · Москва</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">001</span></div>
          <div className="dp-spec"><span className="k">Состояние</span><span className="v green">Новое, оригинал</span></div>
          <div className="dp-spec"><span className="k">Гарантия</span><span className="v">12 месяцев</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Купить сейчас</button>
          <button className="btn">Запросить цену</button>
        </div>
      </>
    ),
    'battery': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 140 90"><rect x="4" y="4" width="132" height="82" rx="7" fill="#1c202a" stroke="#3a4051"/><rect x="12" y="62" width="50" height="14" rx="2" fill="#22c55e" opacity=".7"/></svg></div>
          <div>
            <div className="dp-title">Аккумулятор</div>
            <div className="dp-seller">🏪 PartsLab · <span className="star">★</span> 4.8</div>
          </div>
        </div>
        <div>
          <div className="dp-price">4 500 ₽</div>
          <div className="dp-note">в наличии · 3 шт · Москва</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">002</span></div>
          <div className="dp-spec"><span className="k">Ёмкость</span><span className="v">3561 mAh</span></div>
          <div className="dp-spec"><span className="k">Гарантия</span><span className="v">6 месяцев</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Купить сейчас</button>
          <button className="btn">Запросить цену</button>
        </div>
      </>
    ),
    'camera': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 110 110"><rect x="4" y="4" width="102" height="102" rx="22" fill="#161a22" stroke="#353c4d"/><circle cx="38" cy="38" r="14" fill="#000"/><circle cx="72" cy="38" r="14" fill="#000"/></svg></div>
          <div>
            <div className="dp-title">Камера основная</div>
            <div className="dp-seller">🏪 PhoneDoc · <span className="star">★</span> 4.7</div>
          </div>
        </div>
        <div>
          <div className="dp-price">12 800 ₽</div>
          <div className="dp-note">донор · 2 шт · СПб</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">003</span></div>
          <div className="dp-spec"><span className="k">Состояние</span><span className="v blue">Оригинал б/у</span></div>
          <div className="dp-spec"><span className="k">Проверка</span><span className="v green">Протестировано</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Купить сейчас</button>
          <button className="btn">Запросить цену</button>
        </div>
      </>
    ),
    'coil': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 140 140"><circle cx="70" cy="100" r="35" fill="#0d0d0d" stroke="#c99160" strokeWidth="2"/><circle cx="70" cy="100" r="20" fill="none" stroke="#c99160" strokeWidth="2"/></svg></div>
          <div>
            <div className="dp-title">Катушка MagSafe</div>
            <div className="dp-seller">🏪 iFix Moscow · <span className="star">★</span> 4.9</div>
          </div>
        </div>
        <div>
          <div className="dp-price">2 100 ₽</div>
          <div className="dp-note">донор · 4 шт · Москва</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">004</span></div>
          <div className="dp-spec"><span className="k">Состояние</span><span className="v blue">Оригинал б/у</span></div>
          <div className="dp-spec"><span className="k">Совместимость</span><span className="v">iPhone 16 / 16 Pro</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Купить сейчас</button>
          <button className="btn">Запросить цену</button>
        </div>
      </>
    ),
    'charging': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 200 160"><path d="M 20 90 L 180 90 L 180 150 L 20 150 Z" fill="#1a1a1a" stroke="#333"/><rect x="55" y="128" width="65" height="22" rx="3" fill="#c9962a"/></svg></div>
          <div>
            <div className="dp-title">Шлейф зарядки USB-C</div>
            <div className="dp-seller">🏪 MobileParts · <span className="star">★</span> 4.6</div>
          </div>
        </div>
        <div>
          <div className="dp-price">1 200 ₽</div>
          <div className="dp-note">под заказ · 3-5 дней</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">005</span></div>
          <div className="dp-spec"><span className="k">Состояние</span><span className="v yellow">Аналог, качество A</span></div>
          <div className="dp-spec"><span className="k">Гарантия</span><span className="v">3 месяца</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Заказать</button>
          <button className="btn">Запросить цену</button>
        </div>
      </>
    ),
    'board': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 130 100"><path d="M 6 6 L 124 6 L 124 94 L 6 94 Z" fill="#1e4d38" stroke="#3a7050"/><rect x="16" y="14" width="22" height="22" fill="#0a0c10"/></svg></div>
          <div>
            <div className="dp-title">Материнская плата A18</div>
            <div className="dp-seller" style={{color: "var(--red)"}}>🚫 Нет предложений</div>
          </div>
        </div>
        <div>
          <div className="dp-price" style={{background: "none", WebkitTextFillColor: "var(--muted)", color: "var(--muted)"}}>—</div>
          <div className="dp-note">Редкая позиция · оставьте заявку</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">006</span></div>
          <div className="dp-spec"><span className="k">Статус</span><span className="v red">Ищу донора</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Создать заявку на донора</button>
          <button className="btn">Подписаться</button>
        </div>
      </>
    ),
    'speaker': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 120 80"><rect x="4" y="4" width="112" height="72" rx="10" fill="#0a0c12" stroke="#353c4d"/><circle cx="60" cy="40" r="22" fill="none" stroke="#353c4d" strokeDasharray="2 3"/></svg></div>
          <div>
            <div className="dp-title">Динамик (Speaker)</div>
            <div className="dp-seller" style={{color: "var(--red)"}}>🚫 Нет предложений</div>
          </div>
        </div>
        <div>
          <div className="dp-price" style={{background: "none", WebkitTextFillColor: "var(--muted)", color: "var(--muted)"}}>—</div>
          <div className="dp-note">Нижний основной динамик</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">007</span></div>
          <div className="dp-spec"><span className="k">Статус</span><span className="v red">Отсутствует</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Оставить заявку</button>
          <button className="btn">Подписаться</button>
        </div>
      </>
    ),
    'buzzer': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 100 90"><rect x="4" y="4" width="92" height="82" rx="10" fill="#0a0c12" stroke="#353c4d"/><circle cx="50" cy="45" r="18" fill="none" stroke="#353c4d" strokeDasharray="2 3"/></svg></div>
          <div>
            <div className="dp-title">Бузер (Buzzer)</div>
            <div className="dp-seller" style={{color: "var(--red)"}}>🚫 Нет предложений</div>
          </div>
        </div>
        <div>
          <div className="dp-price" style={{background: "none", WebkitTextFillColor: "var(--muted)", color: "var(--muted)"}}>—</div>
          <div className="dp-note">Вспомогательный динамик</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">008</span></div>
          <div className="dp-spec"><span className="k">Статус</span><span className="v red">Отсутствует</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Оставить заявку</button>
          <button className="btn">Подписаться</button>
        </div>
      </>
    ),
    'btn-power': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 100 140"><path d="M 50 8 L 50 20 L 40 20 L 40 40 L 30 40 L 30 60 L 40 60 L 40 100 L 50 100 L 50 120 L 60 120 L 60 100 L 70 100 L 70 60 L 60 60 L 60 40 L 70 40 L 70 20 L 60 20 L 60 8 Z" fill="#1a1a1a" stroke="#333"/></svg></div>
          <div>
            <div className="dp-title">Шлейф кнопки Power</div>
            <div className="dp-seller" style={{color: "var(--red)"}}>🚫 Нет предложений</div>
          </div>
        </div>
        <div>
          <div className="dp-price" style={{background: "none", WebkitTextFillColor: "var(--muted)", color: "var(--muted)"}}>—</div>
          <div className="dp-note">Шлейф с кнопкой включения</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">009</span></div>
          <div className="dp-spec"><span className="k">Статус</span><span className="v red">Отсутствует</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Оставить заявку</button>
          <button className="btn">Подписаться</button>
        </div>
      </>
    ),
    'btn-vol-up': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 100 160"><rect x="30" y="20" width="40" height="18" rx="2" fill="#1a1a1a" stroke="#333"/><rect x="30" y="55" width="40" height="26" rx="2" fill="#1a1a1a" stroke="#333"/><rect x="30" y="95" width="40" height="26" rx="2" fill="#1a1a1a" stroke="#333"/></svg></div>
          <div>
            <div className="dp-title">Шлейф кнопок громкости + Action</div>
            <div className="dp-seller" style={{color: "var(--red)"}}>🚫 Нет предложений</div>
          </div>
        </div>
        <div>
          <div className="dp-price" style={{background: "none", WebkitTextFillColor: "var(--muted)", color: "var(--muted)"}}>—</div>
          <div className="dp-note">3 кнопки: Action, Vol+, Vol−</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">010</span></div>
          <div className="dp-spec"><span className="k">Статус</span><span className="v red">Отсутствует</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Оставить заявку</button>
          <button className="btn">Подписаться</button>
        </div>
      </>
    ),
    'mic-bottom': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 120 80"><rect x="4" y="4" width="112" height="72" rx="10" fill="#0a0c12" stroke="#353c4d"/><circle cx="40" cy="40" r="3" fill="none" stroke="#4a5468"/><circle cx="60" cy="40" r="3" fill="none" stroke="#4a5468"/><circle cx="80" cy="40" r="3" fill="none" stroke="#4a5468"/></svg></div>
          <div>
            <div className="dp-title">Микрофон нижний</div>
            <div className="dp-seller" style={{color: "var(--red)"}}>🚫 Нет предложений</div>
          </div>
        </div>
        <div>
          <div className="dp-price" style={{background: "none", WebkitTextFillColor: "var(--muted)", color: "var(--muted)"}}>—</div>
          <div className="dp-note">Разговорный микрофон</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">011</span></div>
          <div className="dp-spec"><span className="k">Статус</span><span className="v red">Отсутствует</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Оставить заявку</button>
          <button className="btn">Подписаться</button>
        </div>
      </>
    ),
    'backglass': (
      <>
        <div className="dp-header">
          <div className="dp-thumb"><svg viewBox="0 0 120 200"><rect x="4" y="4" width="112" height="192" rx="22" fill="#e81c10" stroke="#7a0500"/><rect x="12" y="14" width="58" height="58" rx="16" fill="#5a0800"/></svg></div>
          <div>
            <div className="dp-title">Задняя крышка PRODUCT(RED)</div>
            <div className="dp-seller" style={{color: "var(--red)"}}>🚫 Нет предложений</div>
          </div>
        </div>
        <div>
          <div className="dp-price" style={{background: "none", WebkitTextFillColor: "var(--muted)", color: "var(--muted)"}}>—</div>
          <div className="dp-note">Цвет PRODUCT(RED)</div>
        </div>
        <div className="dp-specs">
          <div className="dp-spec"><span className="k">Черт. №</span><span className="v">012</span></div>
          <div className="dp-spec"><span className="k">Статус</span><span className="v red">Отсутствует</span></div>
        </div>
        <div className="dp-actions">
          <button className="btn btn-primary">Оставить заявку</button>
          <button className="btn">Подписаться</button>
        </div>
      </>
    ),
  }

  const phoneSvg = (
    <svg viewBox="0 0 340 640" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="pencil" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="noise"/>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.6" xChannelSelector="R" yChannelSelector="G"/>
            </filter>
            <pattern id="hatch-45" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#6a7a94" strokeWidth="0.5" opacity=".6"/>
            </pattern>
            <pattern id="hatch-dense" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="3" stroke="#6a7a94" strokeWidth="0.4" opacity=".7"/>
            </pattern>
          </defs>

          {/* ВНЕШНИЙ КОНТУР */}
          <rect x="20" y="20" width="300" height="600" rx="46" className="sketch-line-bold"/>
          <rect x="24" y="24" width="292" height="592" rx="44" className="sketch-line-thin"/>

          {/* ДИНАМИК ВЕРХНИЙ */}
          <g className="svg-part" data-part="speaker-top">
            <rect className="part-hover" x="130" y="34" width="80" height="10" rx="5" fill="rgba(124,247,208,.25)"/>
            <rect x="130" y="34" width="80" height="10" rx="5" className="sketch-line"/>
            <line x1="135" y1="36" x2="135" y2="42" className="sketch-line-thin"/>
            <line x1="145" y1="36" x2="145" y2="42" className="sketch-line-thin"/>
            <line x1="155" y1="36" x2="155" y2="42" className="sketch-line-thin"/>
            <line x1="165" y1="36" x2="165" y2="42" className="sketch-line-thin"/>
            <line x1="175" y1="36" x2="175" y2="42" className="sketch-line-thin"/>
            <line x1="185" y1="36" x2="185" y2="42" className="sketch-line-thin"/>
            <line x1="195" y1="36" x2="195" y2="42" className="sketch-line-thin"/>
            <line x1="205" y1="36" x2="205" y2="42" className="sketch-line-thin"/>
          </g>

          {/* ПЛАТА */}
          <g className="svg-part" data-part="board">
            <path className="part-hover" d="M 40 60 L 150 60 L 150 220 L 90 220 L 90 240 L 40 240 Z" fill="rgba(124,247,208,.15)"/>
            <path className="sketch-line" d="M 40 60 L 150 60 L 150 220 L 90 220 L 90 240 L 40 240 Z"/>
            <rect x="50" y="70" width="34" height="30" className="sketch-line-thin"/>
            <text x="67" y="88" fontSize="6" fill="#8a98b0" textAnchor="middle" fontFamily="monospace" letterSpacing=".5">A18</text>
            <rect x="90" y="70" width="50" height="24" className="sketch-line-thin"/>
            <rect x="50" y="108" width="44" height="36" className="sketch-line-thin"/>
            <rect x="100" y="108" width="40" height="30" className="sketch-line-thin"/>
            <rect x="50" y="152" width="90" height="30" className="sketch-line-thin"/>
            <rect x="50" y="70" width="34" height="30" fill="url(#hatch-45)" opacity=".6"/>
            <rect x="90" y="70" width="50" height="24" fill="url(#hatch-45)" opacity=".6"/>
            <rect x="50" y="108" width="44" height="36" fill="url(#hatch-45)" opacity=".6"/>
            <rect x="100" y="108" width="40" height="30" fill="url(#hatch-45)" opacity=".6"/>
            <path d="M 44 100 L 80 100 L 80 130" className="sketch-line-dash"/>
            <path d="M 44 195 L 140 195" className="sketch-line-dash"/>
            <circle cx="140" cy="160" r="3" className="sketch-line-thin"/>
            <circle cx="140" cy="172" r="3" className="sketch-line-thin"/>
          </g>

          {/* КАМЕРА */}
          <g className="svg-part" data-part="camera">
            <rect className="part-hover" x="180" y="60" width="118" height="118" rx="22" fill="rgba(124,247,208,.15)"/>
            <rect className="sketch-line" x="180" y="60" width="118" height="118" rx="22"/>
            <circle className="sketch-line-thin" cx="214" cy="94" r="22"/>
            <circle className="sketch-line-thin" cx="214" cy="94" r="16"/>
            <circle className="sketch-line-thin" cx="214" cy="94" r="8"/>
            <circle cx="208" cy="88" r="3" className="sketch-hatch-dense"/>
            <circle className="sketch-line-thin" cx="262" cy="94" r="22"/>
            <circle className="sketch-line-thin" cx="262" cy="94" r="16"/>
            <circle className="sketch-line-thin" cx="262" cy="94" r="8"/>
            <circle cx="256" cy="88" r="3" className="sketch-hatch-dense"/>
            <circle className="sketch-line-thin" cx="214" cy="142" r="20"/>
            <circle className="sketch-line-thin" cx="214" cy="142" r="14"/>
            <circle className="sketch-line-thin" cx="214" cy="142" r="7"/>
            <circle className="sketch-line-thin" cx="262" cy="142" r="9"/>
            <circle cx="262" cy="142" r="4" className="sketch-hatch-dense"/>
          </g>

          {/* АККУМУЛЯТОР */}
          <g className="svg-part" data-part="battery">
            <rect className="part-hover" x="40" y="280" width="260" height="180" rx="14" fill="rgba(124,247,208,.13)"/>
            <rect className="sketch-line" x="40" y="280" width="260" height="180" rx="14"/>
            <rect className="sketch-line-thin" x="44" y="284" width="252" height="172" rx="12"/>
            <text x="54" y="308" fontSize="8" fill="#8a98b0" fontFamily="monospace" letterSpacing="1.5">APPLE Li-ion</text>
            <text x="54" y="320" fontSize="6" fill="#6a7a94" fontFamily="monospace" letterSpacing="1">3561 mAh · 3.87V</text>
            <line x1="54" y1="330" x2="54" y2="342" className="sketch-hatch-dense"/>
            <line x1="58" y1="330" x2="58" y2="342" className="sketch-hatch-dense"/>
            <line x1="61" y1="330" x2="61" y2="342" className="sketch-hatch-dense"/>
            <line x1="64" y1="330" x2="64" y2="342" className="sketch-hatch-dense"/>
            <line x1="68" y1="330" x2="68" y2="342" className="sketch-hatch-dense"/>
            <line x1="71" y1="330" x2="71" y2="342" className="sketch-hatch-dense"/>
            <line x1="74" y1="330" x2="74" y2="342" className="sketch-hatch-dense"/>
            <rect x="288" y="330" width="14" height="20" className="sketch-line"/>
            <line x1="290" y1="336" x2="300" y2="336" className="sketch-line-thin"/>
            <line x1="290" y1="340" x2="300" y2="340" className="sketch-line-thin"/>
            <rect x="54" y="420" width="70" height="20" className="sketch-line-thin"/>
            <rect x="57" y="423" width="30" height="14" className="sketch-hatch-dense"/>
          </g>

          {/* ДИНАМИК SPEAKER */}
          <g className="svg-part unavailable" data-part="speaker">
            <rect className="part-hover" x="40" y="490" width="120" height="70" rx="10" fill="rgba(239,68,68,.15)"/>
            <rect className="sketch-line" x="40" y="490" width="120" height="70" rx="10"/>
            <circle className="sketch-line-thin" cx="100" cy="525" r="26"/>
            <circle className="sketch-line-thin" cx="100" cy="525" r="20"/>
            <circle className="sketch-line-thin" cx="100" cy="525" r="14"/>
            <circle className="sketch-line-thin" cx="100" cy="525" r="8"/>
            <circle cx="100" cy="525" r="3" className="sketch-hatch-dense"/>
          </g>

          {/* БУЗЕР */}
          <g className="svg-part unavailable" data-part="buzzer">
            <rect className="part-hover" x="180" y="490" width="60" height="70" rx="10" fill="rgba(239,68,68,.15)"/>
            <rect className="sketch-line" x="180" y="490" width="60" height="70" rx="10"/>
            <circle className="sketch-line-thin" cx="210" cy="525" r="18"/>
            <circle className="sketch-line-thin" cx="210" cy="525" r="10"/>
            <circle cx="210" cy="525" r="4" className="sketch-hatch-dense"/>
          </g>

          {/* MAGSAFE */}
          <g className="svg-part" data-part="coil">
            <rect className="part-hover" x="248" y="490" width="52" height="70" rx="10" fill="rgba(124,247,208,.15)"/>
            <rect className="sketch-line" x="248" y="490" width="52" height="70" rx="10"/>
            <circle className="sketch-line-thin" cx="274" cy="525" r="20"/>
            <circle className="sketch-line-thin" cx="274" cy="525" r="15"/>
            <circle className="sketch-line-thin" cx="274" cy="525" r="10"/>
            <circle className="sketch-line-thin" cx="274" cy="525" r="5"/>
            <circle cx="274" cy="525" r="2" className="sketch-hatch-dense"/>
          </g>

          {/* КНОПКИ НА КОРПУСЕ */}
          <g className="svg-part unavailable" data-part="btn-action">
            <rect x="16" y="180" width="6" height="24" rx="1" className="sketch-line"/>
            <rect x="16" y="180" width="6" height="24" rx="1" fill="url(#hatch-dense)" opacity=".4"/>
          </g>
          <g className="svg-part unavailable" data-part="btn-vol-up">
            <rect x="16" y="225" width="6" height="40" rx="1" className="sketch-line"/>
            <rect x="16" y="225" width="6" height="40" rx="1" fill="url(#hatch-dense)" opacity=".4"/>
          </g>
          <g className="svg-part unavailable" data-part="btn-vol-down">
            <rect x="16" y="280" width="6" height="40" rx="1" className="sketch-line"/>
            <rect x="16" y="280" width="6" height="40" rx="1" fill="url(#hatch-dense)" opacity=".4"/>
          </g>
          <g className="svg-part unavailable" data-part="btn-power">
            <rect x="318" y="240" width="6" height="70" rx="1" className="sketch-line"/>
            <rect x="318" y="240" width="6" height="70" rx="1" fill="url(#hatch-dense)" opacity=".4"/>
          </g>

          {/* МИКРОФОНЫ */}
          <g className="svg-part unavailable" data-part="mic-bottom">
            <circle cx="60" cy="600" r="3" className="sketch-line-thin"/>
            <circle cx="72" cy="600" r="3" className="sketch-line-thin"/>
            <circle cx="84" cy="600" r="3" className="sketch-line-thin"/>
            <circle cx="96" cy="600" r="3" className="sketch-line-thin"/>
            <circle cx="108" cy="600" r="3" className="sketch-line-thin"/>
            <circle cx="120" cy="600" r="3" className="sketch-line-thin"/>
            <circle cx="132" cy="600" r="3" className="sketch-line-thin"/>
          </g>
          <g className="svg-part unavailable" data-part="mic-top">
            <circle cx="220" cy="39" r="2.5" className="sketch-line-thin"/>
          </g>

          {/* ШЛЕЙФ ЗАРЯДКИ */}
          <g className="svg-part" data-part="charging">
            <path className="part-hover"
                  d="M 40 620 L 240 620 Q 260 620 260 630 L 260 640 Q 260 650 240 650 L 40 650 Q 30 650 30 640 L 30 630 Q 30 620 40 620 Z"
                  fill="rgba(124,247,208,.18)"/>
            <path className="sketch-line"
                  d="M 40 620 L 240 620 Q 260 620 260 630 L 260 640 Q 260 650 240 650 L 40 650 Q 30 650 30 640 L 30 630 Q 30 620 40 620 Z"/>
            <line x1="45" y1="626" x2="250" y2="626" className="sketch-line-dash"/>
            <line x1="45" y1="632" x2="250" y2="632" className="sketch-line-dash"/>
            <line x1="45" y1="638" x2="250" y2="638" className="sketch-line-dash"/>
            <line x1="45" y1="644" x2="250" y2="644" className="sketch-line-dash"/>
            <rect x="238" y="622" width="30" height="26" rx="4" className="sketch-line"/>
            <rect x="244" y="627" width="18" height="16" rx="8" className="sketch-line-thin"/>
            <line x1="247" y1="632" x2="259" y2="632" className="sketch-line-thin"/>
            <line x1="247" y1="636" x2="259" y2="636" className="sketch-line-thin"/>
            <line x1="247" y1="640" x2="259" y2="640" className="sketch-line-thin"/>
          </g>

          {/* РАЗМЕРНЫЕ ЛИНИИ */}
          <line x1="20" y1="12" x2="320" y2="12" className="dim-line"/>
          <line x1="20" y1="8" x2="20" y2="16" className="dim-line"/>
          <line x1="320" y1="8" x2="320" y2="16" className="dim-line"/>
          <text className="dim-text" x="170" y="10" textAnchor="middle">71.6 mm</text>

          <line x1="330" y1="20" x2="330" y2="620" className="dim-line"/>
          <line x1="326" y1="20" x2="334" y2="20" className="dim-line"/>
          <line x1="326" y1="620" x2="334" y2="620" className="dim-line"/>
          <text className="dim-text" x="332" y="320" textAnchor="middle" transform="rotate(90 332 320)">147.6 mm</text>

          <text className="dim-text" x="336" y="640">7.8 mm</text>

        </svg>
  )

  return (
    <div className="blueprint-page">
      <div className="bg-blueprint"></div>

      <div className="hero">
        <div className="breadcrumbs">
          {back ? back : <Link to="/donor-lots">← Назад к донорам</Link>}
          <span className="sep">/</span>
          <span>{meta.brand || 'Apple'}</span>
          <span className="sep">/</span>
          <span>{modelName} · Технический чертёж</span>
        </div>
        <div className="hero-title">
          <h1>{meta.brand || 'Apple'} {modelName} — <em>технический чертёж разборки</em></h1>
        </div>
        <div className="hero-meta">
          <div className="meta-chip"><b>{THUMBS.filter(t => hasComp(t.key)).length} / 12</b> узлов доступно</div>
          <div className="meta-chip">Ревизия <b>{meta.revision || 'A2897'}</b></div>
          <div className="meta-chip"><b>18</b> мастеров</div>
          <div className="meta-chip">Чертёж обновлён <b>сегодня</b></div>
        </div>
      </div>

      <div className="stage">
        {/* ===== ЧЕРТЁЖ ===== */}
        <div className="phone-zone">
          <div className="blueprint-frame">
            <div className="corner tl"></div>
            <div className="corner tr"></div>
            <div className="corner bl"></div>
            <div className="corner br"></div>
            <div className="blueprint-stamp">
              <div className="stamp-left">
                <span className="stamp-title">{modelName} · <b>РАЗБОРКА</b></span>
                <span className="stamp-sub">РЕВ. {meta.revision || 'A2897'} · 1:1</span>
              </div>
              <div className="stamp-code">
                <span className="big">{meta.revision || 'A2897'}</span>
                № 001-16
              </div>
            </div>
            <div className="phone-drawing">{phoneSvg}</div>
          </div>
          <div className="phone-controls">
            <button className="ctrl-btn" title="Повернуть">⟲</button>
            <button className="ctrl-btn active" title="Рентген">👁</button>
            <button className="ctrl-btn" title="Разобрать">⚡</button>
            <div className="ctrl-divider"></div>
            <button className="ctrl-btn" title="Сравнить">⚖</button>
            <button className="ctrl-btn" title="Поделиться">↗</button>
          </div>
        </div>

        {/* ===== КАРТОЧКИ ===== */}
        <div className="parts-canvas">
          <div className="canvas-title">
            <h2>Компоненты чертежа · <b>12 узлов</b></h2>
            <div className="view-toggle">
              <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>Сетка</button>
              <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>Список</button>
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="thumbs-grid">
              {THUMBS.map((t) => {
                const avail = hasComp(t.key)
                const c = compByPart[t.key]
                const isActive = activePart === t.key
                return (
                  <div
                    key={t.key}
                    className={`thumb ${isActive ? 'active' : ''} ${avail ? '' : 'unavailable'}`}
                    onMouseEnter={() => setHoveredPart(t.key)}
                    onMouseLeave={() => setHoveredPart(null)}
                    onClick={() => setSelectedPart(t.key)}
                  >
                    <div className="thumb-preview">
                      <span className={`thumb-status ${avail ? 'in-stock' : 'none'}`}>{avail ? 'В наличии' : 'Нет'}</span>
                      <span className="thumb-code">{t.code}</span>
                      {t.svg}
                    </div>
                    <div className="thumb-name">{t.name}</div>
                    <div className="thumb-meta">
                      {avail ? (
                        <span className="seller">🏪 <b>{c.seller_name || 'iFix Moscow'}</b></span>
                      ) : (
                        <span className="seller" style={{ color: 'var(--muted)' }}>🚫 нет предложений</span>
                      )}
                    </div>
                    <div className="thumb-bottom">
                      <div className="thumb-price">{avail ? fmt(c.price_rub) : '—'}</div>
                      <div className="thumb-stock">{avail ? '1 шт' : 'нет'}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="pl-list" style={{ maxHeight: 'none' }}>
              {THUMBS.map((t) => {
                const avail = hasComp(t.key)
                const c = compByPart[t.key]
                const isActive = activePart === t.key
                return (
                  <div key={t.key} className={`pl-item ${isActive ? 'active' : ''} ${avail ? '' : 'unavailable'}`} onClick={() => setSelectedPart(t.key)}>
                    <span className={`pl-dot ${avail ? 'green' : 'red'}`}></span>
                    <span className="pl-name">{t.name}</span>
                    <span className="pl-price">{avail ? fmt(c.price_rub) : '—'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ===== ПРАВАЯ КОЛОНКА ===== */}
        <div className="right-col">
          <div className="side-card">
            <div className="side-title">
              <h3>Спецификация узлов</h3>
              <span className="side-count">{THUMBS.filter(t => hasComp(t.key)).length} / 12</span>
            </div>
            <div className="pl-list">
              {SPECS.map((s) => {
                const avail = hasComp(s.key)
                const c = compByPart[s.key]
                const isActive = activePart === s.key
                return (
                  <div
                    key={s.key}
                    className={`pl-item ${isActive ? 'active' : ''} ${avail ? '' : 'unavailable'}`}
                    onMouseEnter={() => setHoveredPart(s.key)}
                    onMouseLeave={() => setHoveredPart(null)}
                    onClick={() => setSelectedPart(s.key)}
                  >
                    <span className={`pl-dot ${avail ? 'green' : 'red'}`}></span>
                    <span className="pl-name">{s.name}</span>
                    <span className="pl-price">{avail ? fmt(c.price_rub) : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="side-card">
            <div className="detail-info active">{DETAILS[activePart] || DETAILS['screen']}</div>
            {detailExtra && compByPart[activePart] && detailExtra(compByPart[activePart])}
          </div>
        </div>
      </div>

      {/* ===== QUICK BAR ===== */}
      <div className="quick-bar">
        <button className="qb-item"><span className="icon">🔍</span>Найти</button>
        <button className="qb-item highlight"><span className="icon">📦</span>Собрать комплект</button>
        <button className="qb-item"><span className="icon">🔔</span>Подписаться</button>
        <button className="qb-item"><span className="icon">📢</span>Заявка на донора</button>
        <div className="qb-divider"></div>
        <button className="qb-item"><span className="icon">📐</span>Скачать чертёж</button>
        <button className="qb-item"><span className="icon">⚡</span>Разобрать</button>
      </div>
    </div>
  )
}