// SPDX-FileCopyrightText: 2022 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import {IBridge} from "../interfaces/IBridge.sol";

contract BridgeStub is IBridge {
    address public activeOutbox;

    constructor(address activeOutbox_) payable {
        activeOutbox = activeOutbox_;
    }
}
