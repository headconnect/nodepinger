# Changelog

This changelog follows the following template:

- Features: Things added
- Updates: Modules changed
- Fixes: Bugs squashed
- Known Issues: Bugs not squashed

## 0.1.2

- Features: 
- Updates: 
- Fixes: 
  - Now handles ips as hostnames as valid targets
- Known Issues:

## 0.1.1

- Features: 
- Updates: 
- Fixes: 
  - Removes the hard DNS server `1.1.1.1` so as to use cluster-internal.
  - Sets `ndots` to 2 
- Known Issues:
  - When hostname is IP already, resolver filters them out because they cannot be resolved. Should be solved by checking if `hostname` is valid IP before trying to resolve it.