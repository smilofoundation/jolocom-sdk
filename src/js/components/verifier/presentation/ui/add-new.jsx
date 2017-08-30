import React from 'react'
import Radium from 'radium'
import ContentAddCircle from 'material-ui/svg-icons/content/add-circle'
import {theme} from 'styles'

import {
  ListItem,
  FlatButton,
  Divider
} from 'material-ui'

const STYLES = {
  divider: {
  },
  addBtn: {
    margin: '8px 0',
    textAlign: 'left',
    color: theme.jolocom.gray2
  },
  infoHeader: {
    display: 'inline-block',
    textAlign: 'left',
    color: theme.jolocom.gray2,
    left: '10px',
    paddingBottom: '10px',
    verticalAlign: 'middle'
  },
  icon: {
  }
}
const AddNew = ({value, onClick}) => {
  return (
    <ListItem disabled leftIcon={<div />} style={STYLES.list}>
      <FlatButton
        color={STYLES.addBtn.color}
        style={STYLES.addBtn}
        onClick={() => { onClick() }}
        label={value}
        icon={
          <ContentAddCircle
            style={STYLES.icon}
            color={STYLES.addBtn.color}
          />
        }
      />
      <Divider style={STYLES.divider} />
    </ListItem>
  )
}

AddNew.propTypes = {
  value: React.PropTypes.any,
  onClick: React.PropTypes.func.isRequired
}

export default Radium(AddNew)