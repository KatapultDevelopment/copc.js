import fetch from 'cross-fetch'

export type Getter = (begin: number, end: number) => Promise<Uint8Array>
export const Getter = { create, http: getHttpGetter, file: getFsGetter, fileObject: getFileGetter }

function create(arg: string | File | Getter): Getter {
  if (typeof arg === 'function') return arg
  
  if (arg instanceof File) return getFileGetter(arg)

  if (arg.startsWith('http://') || arg.startsWith('https://')) {
    return getHttpGetter(arg)
  }

  return getFsGetter(arg)
}

function getHttpGetter(filename: string): Getter {
  return async function getter(begin, end) {
    if (begin < 0 || end < 0 || begin > end) throw new Error('Invalid range')
    const response = await fetch(filename, {
      headers: { Range: `bytes=${begin}-${end - 1}` },
    })

    const ab = await response.arrayBuffer()
    return new Uint8Array(ab)
  }
}

function getFileGetter(file: File): Getter {
  return async function getter(begin, end) {
    if (begin < 0 || end < 0 || begin > end) throw new Error('Invalid range')
    
    const blob = file.slice(begin, end)
    const arrayBuffer = await blob.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }
}

function getFsGetter(filename: string): Getter {
  return async function getter(begin, end) {
    const fs = await import('fs')

    async function read(begin = 0, end = Infinity): Promise<Uint8Array> {
      if (begin < 0 || end < 0 || begin > end) throw new Error('Invalid range')

      await fs.promises.access(filename)
      const stream = fs.createReadStream(filename, {
        start: begin,
        end: end - 1,
        autoClose: true,
      })
      return drain(stream)
    }

    return read(begin, end)
  }
}

async function drain(stream: NodeJS.ReadableStream): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    stream.on('data', (chunk) => chunks.push(new Uint8Array(chunk)))
    stream.on('error', reject)
    stream.on('end', () => {
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      resolve(result)
    })
  })
}
