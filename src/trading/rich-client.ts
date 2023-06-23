import {default as getFastify} from 'fastify'

import {IBKRClient} from './brokerage-clients/IBKR/IBKRClient'

const fastify = getFastify({logger: true})

fastify.post<{Body: {test: string}}>('/', async (req): Promise<string> => {
  return `Good job ${req.body.test}`
})

const start = async () => {
  try {
    await fastify.listen({port: 3000})

    const client = new IBKRClient()
  } catch (error) {
    fastify.log.error(error)
    process.exit(1)
  }
}

start()

