import React, { useState } from 'react'
import { connect } from 'react-redux'
import { NavigationScreenProp, NavigationState } from 'react-navigation'
import { AppError, reportError } from '../../../lib/errors'
import { ThunkDispatch } from '../../../store'
import { routeList } from '../../../routeList'
import { navigationActions } from '../../../actions'
import { Emoji, EmojiSection } from '../components/emojiSection'
import { Container } from '../../structure'
import { styles } from '../styles'
import { ScrollView } from 'react-native'
import { ChooseIssueSection } from '../components/chooseIssueSection'
import { DescriptionSection } from '../components/descriptionSection'
import { ContactSection } from '../components/contactSection'
import { GradientButton } from '../../structure/gradientButton'
import I18n from '../../../locales/i18n'
import strings from '../../../locales/strings'
import { SectionWrapper } from '../components/sectionWrapper'
interface PaymentNavigationParams {
  error: AppError | Error | undefined
}

interface Props extends ReturnType<typeof mapDispatchToProps> {
  navigation: NavigationScreenProp<NavigationState, PaymentNavigationParams>
}

export enum Inputs {
  None,
  Dropdown,
  Description,
  Contact,
}

const ErrorReportingContainer = (props: Props) => {
  const { navigateToScreen, navigation } = props

  const [pickedIssue, setIssue] = useState<string>()
  const [description, setDescription] = useState<string>('')
  const [contact, setContact] = useState<string>('')
  const [currentInput, setInput] = useState<Inputs>(Inputs.None)
  const [toggleState, setToggle] = useState<boolean>(false)
  const [selectedEmoji, setEmoji] = useState<Emoji>(Emoji.Empty)

  const onSubmitReport = () => {
    const { error } = props.navigation.state.params

    const userReport = {
      userError: pickedIssue,
      userDescription: description,
      userContact: contact,
    }

    if (navigation && error) {
      reportError({ ...userReport, error })
      if (error instanceof AppError) {
        navigateToScreen(error.navigateTo)
      } else {
        navigateToScreen(routeList.AppInit)
      }
    }
  }

  return (
    <Container style={styles.wrapper}>
      <ScrollView>
        <SectionWrapper
          title={I18n.t(strings.CHOOSE_THE_ISSUE)}
          style={{ marginTop: 35 }}
        >
          <ChooseIssueSection
            currentInput={currentInput}
            pickedIssue={pickedIssue}
            onIssuePick={setIssue}
            setInput={setInput}
          />
        </SectionWrapper>
        <SectionWrapper title={I18n.t(strings.CAN_YOU_BE_MORE_SPECIFIC)}>
          <DescriptionSection
            currentInput={currentInput}
            setInput={setInput}
            setDescription={setDescription}
            toggleState={toggleState}
            setToggle={setToggle}
            description={description}
          />
        </SectionWrapper>
        <SectionWrapper title={I18n.t(strings.NEED_TO_TALK_TO_US)}>
          <ContactSection
            onContactInput={setContact}
            currentInput={currentInput}
            setInput={setInput}
            contactValue={contact}
          />
        </SectionWrapper>
        <SectionWrapper title={I18n.t(strings.SOMETHING_ELSE)}>
          <EmojiSection selectedEmoji={selectedEmoji} setEmoji={setEmoji} />
        </SectionWrapper>
        <GradientButton
          onPress={onSubmitReport}
          containerStyle={{
            marginTop: 45,
            marginBottom: 66,
          }}
          text={I18n.t(strings.SUBMIT_REPORT)}
        />
      </ScrollView>
    </Container>
  )
}

const mapDispatchToProps = (dispatch: ThunkDispatch) => ({
  navigateToScreen: (screen: routeList) =>
    dispatch(navigationActions.navigate({ routeName: screen })),
})

export const ErrorReporting = connect(
  null,
  mapDispatchToProps,
)(ErrorReportingContainer)
