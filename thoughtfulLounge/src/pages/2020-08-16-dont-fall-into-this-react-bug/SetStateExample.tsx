import * as React from "react";
import { Button } from '../../../components/Button';

export class ClassSetState extends React.Component {
  state = {
    name: "Andrei",
  };

  render() {
    return (
      <div>
        <p>
          Current state is: <b>{JSON.stringify(this.state)}</b>
        </p>
        <Button title="Set State" onClick={() => this.setState({ age: 12 })} />
      </div>
    );
  }
}

export const SetStateExample = () => {
  const [state, setState] = React.useState({ name: "Andrei" });

  return (
    <div>
      <p>
        Current state is: <b>{JSON.stringify(state)}</b>
      </p>
      <Button title="Set State" onClick={() => setState({ age: 12 } as any)} />
    </div>
  );
};
