import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.VITE_JUMBOSWAP_BASE ?? '/jumboswap/',
  plugins: [react()],
  build: {
    minify: false, // Because genCircuit relies on function.toString
  },
});
