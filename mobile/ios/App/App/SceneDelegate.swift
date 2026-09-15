import UIKit
import Capacitor

/// Required by Xcode 27 / iOS 27 SDK — without a scene lifecycle the app
/// launches to a black screen (`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        // Match the light app canvas — .systemBackground follows OS dark mode
        // and shows through as a dark status-bar gradient when the web UI is light.
        window.backgroundColor = .white
        let bridge = CanderBridgeViewController()
        bridge.view.backgroundColor = .white
        window.rootViewController = bridge
        window.makeKeyAndVisible()
        self.window = window

        // Keep AppDelegate.window set for Capacitor Keyboard plugin lookups.
        if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
            appDelegate.window = window
        }

        // Capacitor 7 has no SceneDelegateProxy — forward cold-start URLs.
        if let url = connectionOptions.urlContexts.first?.url {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: url,
                options: [:]
            )
        }
        if let activity = connectionOptions.userActivities.first(where: {
            $0.activityType == NSUserActivityTypeBrowsingWeb
        }) {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                continue: activity,
                restorationHandler: { _ in }
            )
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: url,
            options: [:]
        )
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}
