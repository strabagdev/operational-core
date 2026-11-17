export const attendanceRepetitionPolicies = ["ONE_PER_DAY", "MULTIPLE_WITH_WARNING", "MULTIPLE"] as const;
export type AttendanceRepetitionPolicy = typeof attendanceRepetitionPolicies[number];
export function attendanceRepetitionPolicy(value?: AttendanceRepetitionPolicy) { return value ?? "ONE_PER_DAY"; }
export function allowsAttendanceRepetition(value?: AttendanceRepetitionPolicy) { return attendanceRepetitionPolicy(value) !== "ONE_PER_DAY"; }
