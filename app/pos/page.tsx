import Pos from "./Pos";

export default function Page({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  return <Pos searchParams={searchParams} />;
}
