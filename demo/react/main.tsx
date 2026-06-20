import { createRoot } from 'react-dom/client'
import { MinimalDemo } from './MinimalDemo'

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <MinimalDemo />
  )
}