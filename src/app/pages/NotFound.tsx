import { Link } from 'react-router'
import Icon from '../components/Icon'

interface Props {
  /** Cosa manca: "ricetta" per un id inesistente, altrimenti la pagina. */
  what?: 'ricetta' | 'pagina'
}

/** Pagina di ripiego per indirizzi sconosciuti e ricette eliminate. */
export default function NotFound({ what = 'pagina' }: Props) {
  return (
    <section className="py-10 text-center">
      <Icon name="book" size={40} className="mx-auto mb-3 text-muted" />
      <h1 className="text-2xl font-medium text-fg">{what === 'ricetta' ? 'Ricetta non trovata' : 'Pagina non trovata'}</h1>
      <p className="mt-1 text-fg-2">
        {what === 'ricetta'
          ? 'Forse è stata eliminata, oppure il link viene da un altro dispositivo: le ricette restano su quello in cui sono state create.'
          : "L'indirizzo non corrisponde a nessuna schermata dell'app."}
      </p>
      <Link to="/" className="btn-primary mt-4">
        Vai alle ricette
      </Link>
    </section>
  )
}
