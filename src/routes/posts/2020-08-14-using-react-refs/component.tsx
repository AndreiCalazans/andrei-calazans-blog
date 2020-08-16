import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  Component,
} from "react";
import { Button } from "../../../components/Button";

class CompA extends Component {
  someCall = () => 12;
  render() {
    return <h2>Hello Comp A</h2>;
  }
}

function CompB() {
  return <h2>Comp B</h2>;
}

const CompC = forwardRef((props, ref: any) => {
  return <h2 ref={ref}>Comp C </h2>;
});

export const ClassExample = () => {
  const refA = useRef(null);

  return (
    <>
      <CompA ref={refA} />
      <Button
        title="Log CompA's reference"
        onClick={() => {
          console.log('Component A reference: ', refA)
        }}
      />
    </>
  );
};

export const FunctionExample = () => {
  const refA = useRef(null);
  const [log, setLog] = useState("");

  return (
    <>
      <CompA ref={refA} />
      <Button
        title="Log CompA's reference"
        onClick={() => {
          setLog(JSON.stringify(refA));
        }}
      />
      <p>{log}</p>
    </>
  );
};

export const FunctionPlusForwardRefExample = () => {
  const refA = useRef(null);
  const [log, setLog] = useState("");

  return (
    <>
      <CompA ref={refA} />
      <Button
        title="Log CompA's reference"
        onClick={() => {
          setLog(JSON.stringify(refA));
        }}
      />
      <p>{log}</p>
    </>
  );
};

/* export default function App() { */
/*   let refA = useRef(null); */
/*   let refB = useRef(null); */
/*   let refC = useRef(null); */
/*   useEffect(() => { */
/*     console.log(refA); */
/*     console.log(refB); */
/*     console.log(refC); */
/*   }, []); */
/*   return ( */
/*     <div className="App"> */
/*       <CompA ref={refA} /> */
/*       <CompB ref={refB} /> */
/*       <CompC ref={refC} /> */
/*     </div> */
/*   ); */
/* } */
