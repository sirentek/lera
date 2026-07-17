interface LeraUpdateCopyInput {
  baseUpdateAvailable: boolean
  baseVersion?: string
  body: string
  target: 'client' | 'backend'
}

export function resolveLeraUpdateBody({ baseUpdateAvailable, baseVersion, body, target }: LeraUpdateCopyInput): string {
  if (target === 'backend') {
    return body
  }

  const brandedBody = body.replace('Hermes', 'Lera')

  if (!baseVersion) {
    return brandedBody
  }

  const updateBody = baseUpdateAvailable ? 'A new version of Lera is ready to install.' : brandedBody

  return `${updateBody} Base version is at ${baseVersion}.`
}
