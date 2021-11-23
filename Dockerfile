FROM node:current-slim as build
WORKDIR /nodepinger
RUN adduser --gecos '' --disabled-password --no-create-home nodepinger
COPY . .
COPY package.json .
COPY package-lock.json .
RUN npm ci

RUN apt-get update
RUN apt-get -y install nmap

RUN ./node_modules/.bin/tsc
RUN cp ./dist/index.js .

USER nodepinger
CMD node index.js