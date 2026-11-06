import StatsView from "@/components/StatsView";

// The same meta stats, but only over the teams the viewer tagged ★ ("skal
// udfyldes") — the priority opponents they want to prep against first.
export default function StatsPriorityPage() {
  return <StatsView variant="priority" />;
}
