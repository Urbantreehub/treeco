import { useState } from 'react'

const FORM_GROUPS = [
  {
    group: 'Per-Job (on site)',
    forms: [
      {
        id: 'sssp',
        title: 'SSSP',
        description: 'Site-Specific Safety Plan — hazard identification, risk matrix, PPE & crew sign-off. Complete before work starts.',
        icon: '📋',
        url: '/forms/risk-assessment.html',
      },
      {
        id: 'toolbox-meeting',
        title: 'Toolbox Meeting',
        description: 'Pre-work briefing — scope of work, hazards, PPE, weather & crew sign-off',
        icon: '🧰',
        url: '/forms/toolbox-meeting.html',
      },
      {
        id: 'prestart-daily',
        title: 'Pre-Start Check',
        description: 'Morbark 1415, Forst ST6PHD or truck — select machine, check fluids, safety & sign off before operation',
        icon: '🔧',
        url: '/forms/prestart-daily.html',
      },
      {
        id: 'aerial-rescue-plan',
        title: 'Aerial Rescue Plan',
        description: 'Required before any climbing above 3m — rescue coordinator, emergency contacts, procedure & crew signatures',
        icon: '🧗',
        url: '/forms/aerial-rescue-plan.html',
      },
      {
        id: 'permit-to-work',
        title: 'Permit to Work',
        description: 'Required for powerline clearance, traffic management or confined space work — issuer & worker sign-off',
        icon: '🔐',
        url: '/forms/permit-to-work.html',
      },
    ],
  },
  {
    group: 'Incident & Hazard Reporting',
    forms: [
      {
        id: 'incident-report',
        title: 'Incident Report',
        description: 'Injuries, near-misses, dangerous events & property damage — corrective actions, WorkSafe notification & sign-off',
        icon: '🚨',
        url: '/forms/incident-report.html',
      },
    ],
  },
  {
    group: 'Scheduled Audits & Inspections',
    forms: [
      {
        id: 'site-inspection',
        title: 'H&S Site Audit',
        description: 'Quarterly site safety inspection — SiteWise compliance checklist, findings, ratings & corrective actions',
        icon: '🔍',
        url: '/forms/site-inspection.html',
      },
    ],
  },
  {
    group: 'Company Documents',
    forms: [
      {
        id: 'hs-policy',
        title: 'Health & Safety Policy',
        description: 'UTS H&S Policy — roles & responsibilities, SWMS register, emergency procedures. Sign off annually.',
        icon: '📜',
        url: '/forms/hs-policy.html',
      },
    ],
  },
]

export default function Forms() {
  const [active, setActive] = useState(null)

  if (active) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', background: '#fff',
          borderBottom: '1px solid #E8EDE4', flexShrink: 0,
        }}>
          <button onClick={() => setActive(null)} style={{
            background: 'none', border: '1px solid #D0D9C8', borderRadius: 8,
            padding: '6px 14px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', color: '#4A6741',
          }}>← Back</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#2C2416' }}>{active.title}</span>
        </div>
        <iframe src={active.url} style={{ flex: 1, border: 'none', width: '100%' }} title={active.title} />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#2C2416', marginBottom: 6 }}>Forms</h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 28 }}>
        Fill in, sign & export as PDF — uploads automatically to Google Drive.
      </p>

      {FORM_GROUPS.map(({ group, forms }) => (
        <div key={group} style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 10, fontWeight: 800, color: '#aaa', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 10,
          }}>{group}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {forms.map(form => (
              <button key={form.id} onClick={() => setActive(form)} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 20px', background: '#fff',
                border: '1.5px solid #E0E8D8', borderRadius: 12,
                cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#4A6741'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(74,103,65,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E0E8D8'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <span style={{ fontSize: 28, flexShrink: 0 }}>{form.icon}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#2C2416', marginBottom: 3 }}>{form.title}</div>
                  <div style={{ fontSize: 13, color: '#777', lineHeight: 1.4 }}>{form.description}</div>
                </div>
                <span style={{ marginLeft: 'auto', color: '#C0CABB', fontSize: 20 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
