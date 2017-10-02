import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { Button, Loader } from 'semantic-ui-react';

import * as composeActions from '../../../actions/compose';
import { downloadAttachment } from '../../../actions/mail';
import { formatDate } from '../../../services/helperService';

class MailPreview extends Component {
  constructor(props) {
    super(props);

    this.state = {};
  }

  render() {
    return (
      <div className="mail-preview">
        {
          this.props.mail.isFetching &&
          <div className="loader-wrapper">
            <Loader active />
          </div>
        }
        {
          !this.props.mail.isFetching &&
          this.props.mail.thread.length > 0 &&
          <div className="thread-wrapper">
            {this.props.mail.thread.map((mail, mailIndex) => (
              mail.hash &&
              <div className="mail-wrapper" key={mail.hash}>
                <div className="title-wrapper">
                  <span>{formatDate(Date.parse(mail.time))}</span>
                  <h1>{mail.subject}</h1>
                </div>
                <div className="meta">
                  From <span className="from">{
                    mail.from !== this.props.user.mailAddress ?
                      mail.from : 'Me'
                  } </span>
                  to <span className="to">{
                    mail.to !== this.props.user.mailAddress ?
                      mail.to : 'Me'
                  } </span>
                </div>
                <div>
                  <div className="mail-body">
                    <p dangerouslySetInnerHTML={{ __html: mail.body }} />
                  </div>
                  <div className="attachments-wrapper">
                    {
                      mail.attachments.map((item, attachmentIndex) => (
                        <a
                          className="ui label attachment"
                          key={item.name}
                          role="button"
                          tabIndex="-1"
                          onClick={() => {
                            this.props.downloadAttachment(item, mailIndex, attachmentIndex);
                          }}
                        >
                          <i className={`file outline icon ${item.name.split('.').pop().toLowerCase()}`} />
                          {`
                          ${item.name}
                           -
                          ${(item.size / 1024).toFixed(2)}kB
                          `}
                          {
                            !item.downloading &&
                            <i role="button" tabIndex="-1" className="download icon" />
                          }
                          <Loader
                            inline
                            indeterminate
                            size="mini"
                            active={item.downloading}
                          />
                        </a>
                      ))
                    }
                  </div>
                </div>
                <div className="mail-actions">
                  <Button.Group basic>
                    <Button
                      icon="reply"
                      content="Reply"
                      onClick={() => this.props.openCompose({
                        type: 'reply',
                        indexInThread: mailIndex,
                      })}
                    />
                    <Button
                      icon="mail forward"
                      content="Forward"
                      onClick={() => this.props.openCompose({
                        type: 'forward',
                        indexInThread: mailIndex,
                      })}
                    />
                  </Button.Group>
                </div>
              </div>
            ))}
          </div>
        }
        {
          !this.props.mail.isFetching &&
          !this.props.mail.thread.length > 0 &&
          this.props.mail.error &&
          <div className="error-wrapper">
            <h1>Error fetching mail</h1>
            <h2>{JSON.stringify(this.props.mail.error)}</h2>
          </div>
        }
        {
          !this.props.mail.isFetching &&
          !this.props.mail.thread.length > 0 &&
          !this.props.mail.error &&
          <div className="empty-wrapper">
            <h1>No email selected</h1>
          </div>
        }
      </div>
    );
  }
}

MailPreview.propTypes = {
  mail: PropTypes.shape({
    isFetching: PropTypes.bool,
    thread: PropTypes.array,
    error: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    attachments: PropTypes.array,
  }),
  openCompose: PropTypes.func.isRequired,
  downloadAttachment: PropTypes.func.isRequired,
  user: PropTypes.shape({
    mailAddress: PropTypes.string.isRequired,
  }).isRequired,
};

MailPreview.defaultProps = {
  mail: {},
};

const mapStateToProps = state => state;
const mapDispatchToProps = dispatch => bindActionCreators({
  ...composeActions,
  downloadAttachment,
}, dispatch);

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(MailPreview);
