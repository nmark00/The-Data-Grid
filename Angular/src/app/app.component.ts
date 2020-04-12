import { Component, OnInit } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from 'src/environments/environment';
import { MatDialog, MatDialogConfig } from "@angular/material";
import { DialogComponent } from './dialog/dialog.component';

const API_URL = environment.apiUrl;
const PORT = environment.port;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent implements OnInit {

  title = 'THE DATA GRID';

  constructor(private apiService: ApiService, private dialog: MatDialog) { }


  openDialog() {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.disableClose = true;
    dialogConfig.autoFocus = true;
    this.dialog.open(DialogComponent, dialogConfig);
  }

  ngOnInit() { }
}