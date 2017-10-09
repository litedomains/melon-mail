import uniqBy from 'lodash/uniqBy';
import ENS from 'ethjs-ens';
import config from './config.json';
import { generateKeys, encrypt, decrypt } from './cryptoService';
import { executeWhenReady, namehash } from './helperService';

const ENS_MX_INTERFACE_ID = '0x59d1d43c';

let mailContract;

const networks = {
  3: 'ropsten',
  42: 'kovan',
  4: 'rinkeby',
  2: 'morden',
  1: 'mainnet',
};

executeWhenReady(() => {
  try {
    // window.web3 = new Web3(web3.currentProvider);
    web3.eth.getAccounts(() => {
      console.log(web3);

      mailContract = web3.eth.contract(config.abi).at(config.contractAddress);
    });
  } catch (e) {
    console.log(e);
  }
});

const getWeb3Status = () =>
  new Promise((resolve, reject) => {
    if (!web3) {
      return reject({
        message: 'NOT_FOUND',
      });
    }

    return web3.version.getNetwork((err, networkId) => {
      console.log(networkId);
      if (networks[networkId] !== config.network) {
        return reject({
          message: 'WRONG_NETWORK',
        });
      }

      console.log('Web3 status');

      return resolve();
    });
  });

const getAccount = () =>
  new Promise((resolve, reject) => {
    web3.eth.getAccounts((err, accounts) => {
      if (accounts.length === 0) {
        return reject({
          message: 'Account not found.',
        });
      }
      return resolve(accounts[0]);
    });
  });

const getBalance = () => new Promise((resolve, reject) => {
  getAccount()
    .then((account) => {
      web3.eth.getBalance(account, (error, balance) => {
        if (error) {
          return reject({
            message: error,
          });
        }

        return resolve(parseFloat(web3.fromWei(balance)));
      });
    });
});

const checkRegistration = () =>
  new Promise((resolve, reject) => {
    getAccount().then((account) => {
      if (!account) {
        return reject({
          error: true,
          message: 'Account not found.',
        });
      }

      return mailContract.UserRegistered(
        {
          addr: account,
        },
        {
          fromBlock: 0,
          toBlock: 'latest',
        })
        .get((err, events) => {
          if (err) {
            reject({
              error: true,
              message: err,
            });
          }

          console.log(events);

          if (!events.length) {
            return reject({
              error: false,
              notRegistered: true,
              message: 'User not registered.',
            });
          }
          return resolve({
            mail: events[0].args.encryptedUsername,
            address: events[0].args.addr,
            startingBlock: events[0].blockNumber,
          });
        });
    })
      .catch((error) => {
        reject({
          error: true,
          message: error,
        });
      });
  });

const signString = (account, stringToSign) =>
  new Promise((resolve, reject) => {
    web3.personal.sign(web3.fromUtf8(stringToSign), account, (error, result) => {
      if (error) {
        return reject(error);
      }
      return resolve(result);
    });
  });

const getBlockNumber = () =>
  new Promise((resolve, reject) => {
    web3.eth.getBlockNumber((error, latestBlock) => {
      if (error) {
        return reject(error);
      }

      return resolve(latestBlock);
    });
  });

const checkMailAddress = email =>
  new Promise((resolve, reject) => {
    mailContract.UserRegistered(
      {
        usernameHash: web3.sha3(email),
      },
      {
        fromBlock: 0,
        toBlock: 'latest',
      },
    )
      .get((err, events) => {
        if (err) {
          reject({
            message: err,
            events: null,
          });
        }

        if (events.length > 0) {
          return reject({
            message: 'Username is already taken.',
          });
        }

        return resolve({
          message: 'Username is available.',
        });
      });
  });

/* Calls registerUser function from the contract code */

const _registerUser = (mailAddress, signedString) =>
  new Promise((resolve, reject) => {
    const { privateKey, publicKey } = generateKeys(signedString);

    console.log('Registring user');

    getAccount()
      .then((account) => {
        if (!account) {
          return reject({
            message: 'Account not found.',
          });
        }

        return mailContract.registerUser(
          web3.sha3(mailAddress),
          encrypt({ privateKey, publicKey }, mailAddress),
          publicKey,
          { from: account },
          (error) => {
            if (error) {
              return reject({
                message: error,
              });
            }

            return getBlockNumber()
              .then((startingBlock) => {
                resolve({
                  publicKey,
                  privateKey,
                  mailAddress,
                  address: account,
                  startingBlock,
                });
              })
              .catch(() => {
                resolve({
                  publicKey,
                  privateKey,
                  mailAddress,
                  address: account,
                  startingBlock: 0,
                });
              });
          });
      });
  });

/* Scans the blockchain to find the public key for a user */

const _getPublicKey = (email, optionalContract) =>
  new Promise((resolve, reject) => {
    const contract = optionalContract !== undefined ? optionalContract : mailContract;

    contract.UserRegistered(
      {
        usernameHash: web3.sha3(email),
      },
      {
        fromBlock: 0,
        toBlock: 'latest',
      },
    )
      .get((err, events) => {
        if (!events.length) {
          return reject({
            message: 'User not found!',
            events,
          });
        }
        return resolve({
          externalMailContract: optionalContract,
          address: events[0].args.addr,
          publicKey: events[0].args.publicKey,
        });
      });
    // .catch((error) => {
    //   reject({
    //     message: error,
    //     events: null,
    //   });
    // });
  });

/* Subscribes to the mail send event */

const listenForMails = callback =>
  getAccount()
    .then((account) => {
      if (!account) {
        return null;
      }
      return getBlockNumber()
        .then((startingBlock) => {
          mailContract.EmailSent(
            {
              to: account,
            },
            {
              fromBlock: startingBlock,
              toBlock: 'latest',
            },
          )
            .watch((err, events) => {
              if (err) {
                console.log(err);
              }

              callback(events, 'inbox');
            });


          mailContract.EmailSent(
            {
              from: account,
            },
            {
              fromBlock: startingBlock,
              toBlock: 'latest',
            },
          )
            .watch((err, event) => {
              if (err) {
                console.log(err);
              }

              console.log(err);
              callback(event, 'outbox');
            });
        });
    });

const getMails = (folder, fetchToBlock, blocksToFetch) =>
  new Promise((resolve, reject) => {
    console.log(`Fetching emails with batch size of ${blocksToFetch} blocks`);
    getAccount((account) => {
      if (!account) {
        return reject({
          message: 'Account not found.',
        });
      }
      return getBlockNumber()
        .then((currentBlock) => {
          const filter = folder === 'inbox' ? { to: account } : { from: account };
          const fetchTo = fetchToBlock === null ? currentBlock : fetchToBlock;
          mailContract.EmailSent(
            filter,
            {
              fromBlock: fetchTo - blocksToFetch,
              toBlock: fetchTo,
            },
          )
            .get((err, events) => {
              const filteredEvents = uniqBy(events.reverse(), 'args.threadId');
              return resolve({
                mailEvents: filteredEvents,
                fromBlock: fetchTo - blocksToFetch,
              });
            });
          // .catch((error) => {
          //   reject({
          //     message: error,
          //   });
          // });
        });
    });
  });

const getThread = (threadId, afterBlock) =>
  new Promise((resolve, reject) => {
    mailContract.EmailSent(
      {
        threadId,
      },
      {
        fromBlock: afterBlock,
        toBlock: 'latest',
      },
    )
      .get((err, events) => {
        if (err) {
          reject({
            message: err,
          });
        }

        resolve(events.pop());
      });
    // .catch((error) => {
    //   reject({
    //     message: error,
    //   });
    // });
  });

const _sendEmail = (toAddress, mailHash, threadHash, threadId, externalMailContract) =>
  new Promise((resolve, reject) => {
    if (externalMailContract !== undefined) {
      externalMailContract.sendExternalEmail(
        externalMailContract.options.address,
        toAddress,
        mailHash,
        threadHash,
        threadId,
        (error, result) => {
          if (error) {
            return reject({
              message: error,
            });
          }

          return resolve(result);
        });
    }

    mailContract.sendEmail(toAddress, mailHash, threadHash, threadId, (error, result) => {
      if (error) {
        return reject({
          message: error,
        });
      }

      return resolve(result);
    });
  });

const signIn = mail => new Promise((resolve, reject) => {
  getAccount()
    .then((account) => {
      if (!account) {
        return reject({
          message: 'Account not found.',
        });
      }
      return signString(account, config.stringToSign)
        .then((signedString) => {
          const { privateKey, publicKey } = generateKeys(signedString);
          resolve({
            status: true,
            privateKey,
            publicKey,
            mail: decrypt({ privateKey, publicKey }, mail),
          });
        })
        .catch((error) => {
          reject({
            message: error,
          });
        });
    });
});

const fetchAllEvents = folder =>
  new Promise((resolve, reject) => {
    getAccount()
      .then((accounts) => {
        if (accounts.length === 0) {
          return reject({
            message: 'Account not found.',
          });
        }
        const filter = folder === 'inbox' ? { to: accounts[0] } : { from: accounts[0] };
        return mailContract.EmailSent(
          filter,
          {
            fromBlock: 0,
            toBlock: 'latest',
          },
        )
          .get((err, events) => {
            const filteredEvents = uniqBy(events, folder === 'inbox' ? 'args.from' : 'args.to');
            return resolve(filteredEvents);
          });
        // .catch((error) => {
        //   reject({
        //     message: error,
        //   });
        // });
      });
  });

const getAddressInfo = address =>
  new Promise((resolve) => {
    mailContract.UserRegistered(
      {
        addr: address,
      },
      {
        fromBlock: 0,
        toBlock: 'latest',
      },
    )
      .get((err, events) => {
        resolve(events);
      });
    // .catch((error) => {
    //   console.log(error);
    // });
  });

const updateContactsEvent = (hashName, ipfsHash) =>
  new Promise((resolve, reject) => {
    mailContract.updateContacts(hashName, ipfsHash, (err, resp) => {
      if (err) {
        reject(err);
      }

      return resolve(resp);
    });
  });

const getContactsForUser = userHash =>
  new Promise((resolve, reject) => {
    mailContract.ContactsUpdated(
      {
        usernameHash: userHash,
      },
      {
        fromBlock: 0,
        toBlock: 'latest',
      },
    )
      .get((err, events) => {
        if (err) {
          reject(err);
        }

        console.log(events);
        if (events.length > 0) {
          resolve(events.pop());
        } else {
          resolve(null);
        }
      });
    // .catch((err) => {
    //   reject(err);
    // });
  });

const getResolverForDomain = domain =>
  new Promise((resolve, reject) => {
    const ens = new ENS({ provider: web3.currentProvider, network: '3' });
    ens.registry.resolver(namehash(domain), (error, address) => {
      if (error) {
        return reject({
          message: error,
        });
      }
      return resolve(address[0]);
    });
  });

/* Returns address of contract on MX record of given domain on given resolver */

const resolveMx = (resolverAddr, domain) =>
  new Promise((resolve, reject) => {
    getAccount()
      .then((account) => {
        const mxResolverContract = new web3.eth.Contract(config.mxResolverAbi, resolverAddr, {
          from: account,
        });
        mxResolverContract.supportsInterface(ENS_MX_INTERFACE_ID)
          .call((err, res) => {
            if (err) reject(err);
            if (!res) reject(false);

            mxResolverContract.MX(namehash(domain))
              .call((errMx, mailContractAddr) => {
                if (errMx) reject(errMx);
                resolve(mailContractAddr);
              });
          });
      });
  });

// Used for testing purposes
// const setMxRecord = () =>
//   new Promise((resolve, reject) => {
//     getResolverForDomain('decenter-test.test')
//       .then((resolverAddr) => {
//         web3.eth.getAccounts()
//           .then((accounts) => {
//             const mxResolverContract = new web3.eth.Contract(
//               config.mxResolverAbi, resolverAddr, {
//               from: accounts[0],
//             });
//             console.log(mxResolverContract);
//             mxResolverContract.methods.setMxRecord(namehash('decenter-test.test'),
// '              0x372d826abb22ed3546947a32977745830164717b')
//               .send((errMx, data) => {
//                 if (errMx) reject(errMx);
//                 console.log(data);
//                 resolve(data);
//               });
//           });
//       });
//   });

const getMailContract = domain =>
  new Promise((resolve, reject) => {
    getResolverForDomain(domain)
      .then(resolverAddr => resolveMx(resolverAddr, domain))
      .then((resolvedMailContractAddr) => {
        getAccount()
          .then((account) => {
            const resolvedMailContract = new web3.eth.Contract(
              config.abi,
              resolvedMailContractAddr, {
                from: account,
              });
            resolve(resolvedMailContract);
          });
      })
      .catch(err => reject(err));
  });

const resolveUser = (email, domain, isExternalMail) => {
  if (!isExternalMail) {
    return _getPublicKey(email);
  }

  return getMailContract(domain)
    .then((resolvedMailContract) => {
      if (resolvedMailContract === config.contractAddress) {
        return _getPublicKey(email);
      }

      return _getPublicKey(email, resolvedMailContract);
    });
};

export default {
  getWeb3Status,
  signString,
  getAccount,
  listenForMails,
  _registerUser,
  _getPublicKey,
  _sendEmail,
  checkRegistration,
  checkMailAddress,
  signIn,
  getMails,
  getThread,
  getBalance,
  fetchAllEvents,
  resolveUser,
  getAddressInfo,
  updateContactsEvent,
  getContactsForUser,
};
