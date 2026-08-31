import Foundation
import Capacitor
import HealthKit
import UIKit

/**
 * Read-only HealthKit bridge for Cander POC metrics.
 *
 * PRIVACY:
 * - Read-only (NSHealthShareUsageDescription). No writes. No Clinical Records.
 * - Never invent per-type READ grant/deny status (HealthKit hides this).
 * - Never map empty samples → permission denied.
 * - Aggregate in native; discard raw samples after statistics.
 * - Do not log HealthKit values to analytics/network.
 */
@objc(CanderHealthKitPlugin)
public class CanderHealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CanderHealthKitPlugin"
    public let jsName = "CanderHealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryStatistic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openHealthSettings", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    private static let metricMap: [String: HKQuantityTypeIdentifier] = [
        "steps": .stepCount,
        "activeEnergy": .activeEnergyBurned,
        "restingHeartRate": .restingHeartRate,
    ]

    @objc func getAvailability(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve([
                "available": false,
                "reason": "unsupported_platform",
                "message": "Available on iPhone",
            ])
            return
        }
        call.resolve(["available": true])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data unavailable", "unavailable")
            return
        }
        var readTypes = Set<HKObjectType>()
        if let steps = HKObjectType.quantityType(forIdentifier: .stepCount) {
            readTypes.insert(steps)
        }
        if let energy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
            readTypes.insert(energy)
        }
        if let hr = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            readTypes.insert(hr)
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            readTypes.insert(sleep)
        }
        readTypes.insert(HKObjectType.workoutType())

        store.requestAuthorization(toShare: [], read: readTypes) { _, error in
            if let error = error {
                call.reject(error.localizedDescription, "auth_failed")
                return
            }
            // completed ≠ all reads granted
            call.resolve(["completed": true])
        }
    }

    @objc func queryStatistic(_ call: CAPPluginCall) {
        let metric = call.getString("metric") ?? ""
        let startStr = call.getString("start") ?? ""
        let endStr = call.getString("end") ?? ""
        let aggregation = call.getString("aggregation") ?? "sum"

        guard let start = ISO8601DateFormatter().date(from: startStr)
                ?? ISO8601DateFormatter.cander.date(from: startStr),
              let end = ISO8601DateFormatter().date(from: endStr)
                ?? ISO8601DateFormatter.cander.date(from: endStr)
        else {
            call.reject("Invalid start/end", "invalid_range")
            return
        }

        if metric == "sleep" {
            Self.querySleepHours(store: store, start: start, end: end) { result in
                call.resolve(result)
            }
            return
        }

        if metric == "workouts" {
            Self.queryWorkoutCount(store: store, start: start, end: end) { result in
                call.resolve(result)
            }
            return
        }

        guard let ident = Self.metricMap[metric],
              let quantityType = HKQuantityType.quantityType(forIdentifier: ident)
        else {
            call.reject("Unknown metric", "unknown_metric")
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let options: HKStatisticsOptions =
            (aggregation == "average" || metric == "restingHeartRate")
            ? .discreteAverage
            : .cumulativeSum

        let query = HKStatisticsQuery(
            quantityType: quantityType,
            quantitySamplePredicate: predicate,
            options: options
        ) { _, stats, error in
            if let error = error {
                call.reject(error.localizedDescription, "query_failed")
                return
            }
            let unit: HKUnit
            switch metric {
            case "steps":
                unit = .count()
            case "activeEnergy":
                unit = .kilocalorie()
            case "restingHeartRate":
                unit = HKUnit.count().unitDivided(by: .minute())
            default:
                unit = .count()
            }

            var value: Double? = nil
            if options.contains(.cumulativeSum) {
                value = stats?.sumQuantity()?.doubleValue(for: unit)
            } else {
                value = stats?.averageQuantity()?.doubleValue(for: unit)
            }

            // Empty ≠ permission denied
            let coverage = value != nil ? "available" : "none_visible"
            call.resolve([
                "value": value as Any,
                "unit": Self.unitLabel(metric),
                "sampleCount": value != nil ? 1 : 0,
                "coverage": coverage,
            ])
        }
        store.execute(query)
    }

    @objc func queryWorkouts(_ call: CAPPluginCall) {
        let startStr = call.getString("start") ?? ""
        let endStr = call.getString("end") ?? ""
        guard let start = ISO8601DateFormatter().date(from: startStr)
                ?? ISO8601DateFormatter.cander.date(from: startStr),
              let end = ISO8601DateFormatter().date(from: endStr)
                ?? ISO8601DateFormatter.cander.date(from: endStr)
        else {
            call.reject("Invalid start/end", "invalid_range")
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(
            sampleType: .workoutType(),
            predicate: predicate,
            limit: 50,
            sortDescriptors: [sort]
        ) { _, samples, error in
            if let error = error {
                call.reject(error.localizedDescription, "query_failed")
                return
            }
            let workouts = (samples as? [HKWorkout] ?? []).map { w -> [String: Any] in
                var row: [String: Any] = [
                    "id": w.uuid.uuidString,
                    "activityType": String(describing: w.workoutActivityType.rawValue),
                    "start": ISO8601DateFormatter.cander.string(from: w.startDate),
                    "end": ISO8601DateFormatter.cander.string(from: w.endDate),
                    "durationMinutes": w.duration / 60.0,
                ]
                if let energy = w.totalEnergyBurned {
                    row["activeEnergyKcal"] = energy.doubleValue(for: .kilocalorie())
                }
                return row
            }
            call.resolve(["workouts": workouts])
        }
        store.execute(query)
    }

    @objc func openHealthSettings(_ call: CAPPluginCall) {
        // Deep-link guidance — Cander cannot revoke HealthKit grants
        DispatchQueue.main.async {
            if let url = URL(string: "x-apple-health://") {
                UIApplication.shared.open(url, options: [:]) { ok in
                    call.resolve(["ok": ok])
                }
            } else {
                call.resolve(["ok": false])
            }
        }
    }

    private static func unitLabel(_ metric: String) -> String {
        switch metric {
        case "steps": return "count"
        case "activeEnergy": return "kcal"
        case "restingHeartRate": return "bpm"
        case "sleep": return "hours"
        case "workouts": return "count"
        default: return ""
        }
    }

    private static func queryWorkoutCount(
        store: HKHealthStore,
        start: Date,
        end: Date,
        done: @escaping ([String: Any]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(
            sampleType: .workoutType(),
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { _, samples, _ in
            let count = samples?.count ?? 0
            done([
                "value": count,
                "unit": "count",
                "sampleCount": count,
                "coverage": count > 0 ? "available" : "none_visible",
            ])
        }
        store.execute(query)
    }

    private static func querySleepHours(
        store: HKHealthStore,
        start: Date,
        end: Date,
        done: @escaping ([String: Any]) -> Void
    ) {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            done([
                "value": NSNull(),
                "unit": "hours",
                "sampleCount": 0,
                "coverage": "none_visible",
            ])
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(
            sampleType: sleepType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { _, samples, _ in
            let cats = samples as? [HKCategorySample] ?? []
            var seconds: TimeInterval = 0
            for s in cats {
                // Asleep (legacy + staged). Empty ≠ permission denied.
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                ]
                if asleepValues.contains(s.value) {
                    seconds += s.endDate.timeIntervalSince(s.startDate)
                }
            }
            let hours = seconds / 3600.0
            done([
                "value": cats.isEmpty ? NSNull() : hours,
                "unit": "hours",
                "sampleCount": cats.count,
                "coverage": cats.isEmpty ? "none_visible" : "available",
            ])
        }
        store.execute(query)
    }
}

private extension ISO8601DateFormatter {
    static let cander: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
