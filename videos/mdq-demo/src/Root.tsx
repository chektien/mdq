import "./index.css";
import { Composition } from "remotion";
import { MdqDemo, TOTAL } from "./Demo";
import { FPS } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MdqDemo"
      component={MdqDemo}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
