interface Props {
  mode: 'done' | 'locked'
}

export default function ThankYou({ mode }: Props) {
  return (
    <div className="card form-card landing-card">
      <div className="title-row">
        <img src="/medtech-logo.png" alt="MedTech logo" className="title-logo" />
        <div>
          <h1 className="form-title">Borang Undian Cybergen Junior</h1>
        </div>
      </div>

      {mode === 'done' ? (
        <div className="alert success">
          Undian anda telah direkodkan. Terima kasih kerana mengundi!
        </div>
      ) : (
        <div className="alert warn">
          Akaun ini telah mengundi sebelum ini. Setiap pengguna hanya dibenarkan mengundi sekali.
        </div>
      )}

      <p className="muted small">Cybergen Junior Voting Forms · satu undian per akaun Google.</p>
    </div>
  )
}