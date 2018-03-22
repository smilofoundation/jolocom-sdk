import React from 'react'
import { shallow } from 'enzyme'
import Entropy from './entropy'

describe('(Component) Entropy', function() {
  it('should render properly the first time', function() {
    shallow((<Entropy
      imageUncovering
      imageUncoveredPaths=""
      user=""
      onImagePointUncoverd={() => {}}
      onImageUncoveringChange={() => {}}
      onMouseMovement={() => {}}
      onSubmit={() => {}}
      />),
      { context: { muiTheme: { } } }
    )
  })
})