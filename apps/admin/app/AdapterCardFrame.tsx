import type { ReactElement, ReactNode } from 'react'
import type {
  AdapterCardProps,
  AdapterConfigurationForm,
} from './adapter-card-model'

export function AdapterCardFrame({
  title,
  description,
  adapter,
  children,
}: Readonly<
  Pick<AdapterCardProps, 'adapter'> & {
    title: string
    description: string
    children: ReactNode
  }
>): ReactElement {
  return (
    <article className="adapter-card">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <small>
        {adapter
          ? adapter.state + ' · revision ' + String(adapter.revision)
          : 'Not installed'}
      </small>
      {children}
    </article>
  )
}

type ActionsProps = Pick<AdapterCardProps, 'adapter' | 'setState'> & {
  adapterId: string
  form: Pick<AdapterConfigurationForm<unknown>, 'save' | 'validate'>
}

function AdapterStateAction({
  adapter,
  adapterId,
  setState,
}: Omit<ActionsProps, 'form'>): ReactElement | null {
  if (!adapter) return null
  return adapter.state === 'enabled' ? (
    <button
      className="danger"
      onClick={() => void setState(adapterId, 'disabled', adapter.revision)}
    >
      Disable
    </button>
  ) : (
    <button
      className="save"
      onClick={() => void setState(adapterId, 'enabled', adapter.revision)}
    >
      Enable
    </button>
  )
}

export function AdapterActions({
  form,
  ...props
}: Readonly<ActionsProps>): ReactElement {
  return (
    <div className="adapter-actions">
      <button className="secondary" onClick={() => void form.validate()}>
        Validate configuration
      </button>
      <button className="secondary" onClick={() => void form.save()}>
        {props.adapter ? 'Save configuration' : 'Install'}
      </button>
      <AdapterStateAction {...props} />
    </div>
  )
}
