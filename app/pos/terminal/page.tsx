import Pos from "../Pos";
import "./terminal.css";

export default function Page({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  return <Pos searchParams={searchParams} terminal />;
}
