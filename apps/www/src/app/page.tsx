import { Header } from "./components/header";
import { Hero } from "./components/hero";
import { GatewayViz } from "./components/gateway-viz";
import { WhyGrowx } from "./components/why-growx";
import { HowItWorks } from "./components/how-it-works";
import { CodeExample } from "./components/code-example";
import { Routing } from "./components/routing";
import { Observability } from "./components/observability";
import { Security } from "./components/security";
import { Pricing } from "./components/pricing";
import { FAQ } from "./components/faq";
import { GetStarted } from "./components/get-started";
import { Footer } from "./components/footer";

export default function Page() {
  return (
    <div className="www-frame">
      <Header />
      <main>
        <Hero />
        <hr className="section-rule" />
        <GatewayViz />
        <hr className="section-rule" />
        <WhyGrowx />
        <hr className="section-rule" />
        <HowItWorks />
        <hr className="section-rule" />
        <CodeExample />
        <hr className="section-rule" />
        <Routing />
        <hr className="section-rule" />
        <Observability />
        <hr className="section-rule" />
        <Security />
        <hr className="section-rule" />
        <Pricing />
        <hr className="section-rule" />
        <FAQ />
        <hr className="section-rule" />
        <GetStarted />
      </main>
      <Footer />
    </div>
  );
}
