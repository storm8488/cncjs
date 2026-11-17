import get from 'lodash/get';
import store from '../store';
import touch from '../services/touch';
import {
  ERR_BAD_REQUEST,
  ERR_CONFLICT,
  ERR_INTERNAL_SERVER_ERROR
} from '../constants';

export const upload = (req, res) => {
  const { port, name, gcode, context = {} } = req.body;

  if (!port) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'No port specified'
    });
    return;
  }
  if (!gcode) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'Empty G-code'
    });
    return;
  }

  const controller = store.get('controllers["' + port + '"]');
  if (!controller) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'Controller not found'
    });
    return;
  }

  // The touch service holds the machine for a framing (lot F1, review C3): the program it frames
  // is not replaced meanwhile.
  const refused = touch.isStarted() ? touch.refuseUpload(port) : null;
  if (refused) {
    res.status(ERR_CONFLICT).send({
      msg: refused.message
    });
    return;
  }

  // Load G-code
  controller.command('gcode:load', name, gcode, context, (err, state) => {
    if (err) {
      res.status(ERR_INTERNAL_SERVER_ERROR).send({
        msg: 'Failed to load G-code: ' + err
      });
      return;
    }

    res.send({ ...state });
  });
};

export const fetch = (req, res) => {
  const port = req.query.port;

  if (!port) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'No port specified'
    });
    return;
  }

  const controller = store.get('controllers["' + port + '"]');
  if (!controller) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'Controller not found'
    });
    return;
  }

  const { sender } = controller;

  res.send({
    ...sender.toJSON(),
    data: sender.state.gcode
  });
};

export const download = (req, res) => {
  const port = get(req, 'query.port') || get(req, 'body.port');

  if (!port) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'No port specified'
    });
    return;
  }

  const controller = store.get('controllers["' + port + '"]');
  if (!controller) {
    res.status(ERR_BAD_REQUEST).send({
      msg: 'Controller not found'
    });
    return;
  }

  const { sender } = controller;

  const filename = sender.state.name || 'noname.txt';
  const content = sender.state.gcode || '';

  res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent(filename));
  res.setHeader('Connection', 'close');

  res.write(content);
  res.end();
};
