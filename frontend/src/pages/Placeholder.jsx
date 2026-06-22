// Temporary placeholder — replaced week by week as modules are built

export default function Placeholder({ title, week }) {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>🚧</div>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.note}>Coming in Week {week}</p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px',
  },
  card: {
    textAlign: 'center',
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '60px 48px',
    boxShadow: 'var(--shadow)',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--bark)',
    marginBottom: '8px',
  },
  note: {
    color: '#888',
    fontSize: '14px',
  },
}
