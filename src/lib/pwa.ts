import { registerSW } from 'virtual:pwa-register'

/**
 * Enregistre le Service Worker généré par vite-plugin-pwa.
 * - autoUpdate : l'app se met à jour automatiquement en arrière-plan.
 * - On écoute le cycle de vie pour pouvoir avertir l'utilisateur si besoin.
 *
 * En mode dev (npm run dev), le SW est servi grâce à devOptions.enabled = true.
 */
export function setupPWA(): void {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // Une nouvelle version est téléchargée ; on pourrait afficher un toast.
      console.info('[PWA] Nouvelle version disponible.')
    },
    onOfflineReady() {
      console.info('[PWA] Application prête pour le hors-ligne.')
    },
    onRegistered(registration) {
      if (registration) {
        // Vérifie les mises à jour toutes les heures.
        setInterval(
          () => registration.update().catch(() => {}),
          60 * 60 * 1000,
        )
      }
    },
    onRegisterError(error) {
      console.error("[PWA] Échec de l'enregistrement du Service Worker:", error)
    },
  })
}
